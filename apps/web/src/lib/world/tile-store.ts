/**
 * Owns every streamed tile: worker pool, concurrency-limited loading with
 * cancellation, deadlines and retries, visibility, and a GPU-memory budget
 * with LRU eviction.
 *
 * "Cached" (loaded, kept on the GPU) and "active" (drawn this frame) are
 * different states: tiles stay cached while invisible so panning back is
 * instant, until the byte budget forces the least recently drawn ones out.
 */
import * as THREE from "three";
import { childrenOf, parseTileKey, tileKey, tilePath, type TileInfo } from "@geolausanne/geo-types";
import { buildTileObject, disposeObject, type TileMaterials } from "./geometry";
import type { LodResult } from "./lod";
import type { TileWorkerRequest, TileWorkerResponse } from "./tile.worker";
import type { DecodedNode } from "./tile-format";

type EntryState = "loading" | "ready" | "error";

interface Entry {
  key: string;
  tile: TileInfo;
  state: EntryState;
  object: THREE.Group | null;
  gpuBytes: number;
  lastDrawn: number;
  requestId: number;
  lastWanted: number;
  /** failed attempts in a row */
  errors: number;
  retryAt: number;
  /** a load its worker has said nothing about by then is given up */
  deadline: number;
}

interface Pending {
  /** the worker slot running the request */
  slot: number;
  settle(msg: TileWorkerResponse): void;
  /** a slow download is still receiving data */
  progress?(): void;
}

export interface TileStoreStats {
  cached: number;
  drawn: number;
  loading: number;
  gpuBytes: number;
  downloadedBytes: number;
  failed: number;
}

export interface TileStoreOptions {
  baseUrl: string;
  version: string;
  root: THREE.Group;
  materialsFor: (level: number) => TileMaterials;
  budgetBytes: number;
  maxConcurrent: number;
  workerCount: number;
  createWorker: () => Worker;
  onTileReady?: (key: string, object: THREE.Group) => void;
}

/** Waits before retrying a failed tile: quick at first, then every minute for as long as it is wanted. */
const RETRY_MS = [2000, 4000, 8000, 30_000, 60_000];
/**
 * A load its worker says nothing about for this long is given up and the
 * worker replaced: workers abort a fetch that stalls for 20 s and report
 * slow downloads every 5 s, so only a hung or vanished worker stays silent.
 */
export const LOAD_DEADLINE_MS = 30_000;
/** Loads (and failed tiles) nobody asked for in this long are dropped: the camera moved on. */
const UNWANTED_MS = 1500;

const retryDelay = (failures: number) => RETRY_MS[Math.min(failures, RETRY_MS.length) - 1]!;

export class TileStore {
  private entries = new Map<string, Entry>();
  /** worker slots; null while a failed worker waits to be replaced */
  private workers: (Worker | null)[] = [];
  /** failures in a row of each slot without a reply: a worker that cannot even start backs off */
  private workerFailures: number[] = [];
  private respawnAt: number[] = [];
  private nextWorker = 0;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private frame = 0;
  private downloaded = 0;
  private gpuTotal = 0;
  private drawn = new Set<TileInfo>();
  /** nodes the current selection refines through (eviction keeps them) */
  private refined: ReadonlySet<string> = new Set();
  private disposed = false;

  constructor(private opts: TileStoreOptions) {
    for (let slot = 0; slot < opts.workerCount; slot++) {
      this.workerFailures.push(0);
      this.respawnAt.push(0);
      this.spawn(slot);
    }
  }

  isReady = (key: string): boolean => this.entries.get(key)?.state === "ready";

  /** Drawn in the current frame. */
  isDrawn(key: string): boolean {
    return this.entries.get(key)?.object?.visible === true;
  }

  /** Wanted but failed, also while it is being retried. */
  hasFailed(key: string): boolean {
    const e = this.entries.get(key);
    return e !== undefined && e.state !== "ready" && e.errors > 0;
  }

  /** Quality changed: adopt the new budget and concurrency, keeping every loaded tile. */
  setLimits(budgetBytes: number, maxConcurrent: number) {
    this.opts = { ...this.opts, budgetBytes, maxConcurrent };
    this.evict();
  }

  stats(): TileStoreStats {
    let cached = 0;
    let loading = 0;
    let failed = 0;
    for (const e of this.entries.values()) {
      if (e.state === "ready") cached++;
      else if (e.state === "loading") loading++;
      // wanted tiles that keep failing, also while they are being retried
      if (e.state !== "ready" && e.errors > 0) failed++;
    }
    return { cached, drawn: this.drawn.size, loading, gpuBytes: this.gpuTotal, downloadedBytes: this.downloaded, failed };
  }

  /** Meshes currently drawn (for raycasting). */
  drawnObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const e of this.entries.values()) if (e.object?.visible) out.push(e.object);
    return out;
  }

  /** Every loaded tile, drawn or cached (to find the ground where nothing is drawn yet). */
  loadedObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const e of this.entries.values()) if (e.object) out.push(e.object);
    return out;
  }

  url(tile: TileInfo): string {
    return `${this.opts.baseUrl}/${tilePath(tile)}?v=${encodeURIComponent(this.opts.version)}`;
  }

  /** `result.render` holds the index's own TileInfo objects, as `selectTiles` returns them. */
  update(result: LodResult, now: number) {
    if (this.disposed) return;
    this.frame++;
    this.refined = result.refined;
    this.drawn.clear();
    for (const t of result.render) this.drawn.add(t);
    for (const e of this.entries.values()) {
      if (!e.object) continue;
      const visible = this.drawn.has(e.tile);
      e.object.visible = visible;
      if (visible) e.lastDrawn = this.frame;
    }

    for (const e of this.entries.values()) {
      if (e.state === "loading" && now > e.deadline) this.expire(e);
    }
    for (let slot = 0; slot < this.workers.length; slot++) {
      if (!this.workers[slot] && now >= this.respawnAt[slot]!) this.spawn(slot);
    }

    let active = 0;
    let workerless = false;
    for (const e of this.entries.values()) if (e.state === "loading") active++;
    for (const req of result.requests) {
      const e = this.entries.get(req.key);
      if (e) e.lastWanted = now;
      if (active >= this.opts.maxConcurrent || workerless) continue;
      if (!e) {
        const fresh: Entry = {
          key: req.key,
          tile: req.tile,
          state: "loading",
          object: null,
          gpuBytes: 0,
          lastDrawn: 0,
          requestId: 0,
          lastWanted: now,
          errors: 0,
          retryAt: 0,
          deadline: 0,
        };
        if (!this.start(fresh, now)) workerless = true;
        else {
          this.entries.set(req.key, fresh);
          active++;
        }
      } else if (e.state === "error" && now >= e.retryAt) {
        if (!this.start(e, now)) workerless = true;
        else active++;
      }
    }

    // drop what nobody asked for lately (the camera moved on): running loads
    // are aborted, failed tiles start afresh if they are wanted again
    for (const e of this.entries.values()) {
      if (e.state !== "ready" && now - e.lastWanted > UNWANTED_MS) this.cancel(e);
    }
    this.evict();
  }

  /** Retry failed tiles and workers now (the network is back, or the visitor asked). */
  retryNow() {
    for (const e of this.entries.values()) {
      if (e.state !== "error") continue;
      e.errors = 0;
      e.retryAt = 0;
    }
    this.workerFailures.fill(0);
    this.respawnAt.fill(0);
  }

  private spawn(slot: number) {
    const w = this.opts.createWorker();
    w.onmessage = (ev: MessageEvent<TileWorkerResponse>) => {
      this.workerFailures[slot] = 0;
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      if (ev.data.type === "progress") {
        p.progress?.();
        return;
      }
      this.pending.delete(ev.data.id);
      p.settle(ev.data);
    };
    // a crashed worker (or one whose script could not load) answers nothing
    // more: its loads fail like network errors and a new worker takes over
    w.onerror = (ev) => {
      ev.preventDefault();
      this.replaceWorker(slot, w, ev.message || "worker error");
    };
    w.onmessageerror = () => this.replaceWorker(slot, w, "unreadable message from the worker");
    this.workers[slot] = w;
  }

  private replaceWorker(slot: number, w: Worker, reason: string) {
    if (this.disposed || this.workers[slot] !== w) return;
    console.warn(`[tiles] worker ${slot}: ${reason}`);
    w.terminate();
    this.workers[slot] = null;
    for (const [id, p] of this.pending) {
      if (p.slot !== slot) continue;
      this.pending.delete(id);
      p.settle({ type: "error", id, message: reason, aborted: false });
    }
    // replaced at once after a crash; a worker that fails again before its
    // first reply (its script cannot load) waits longer and longer
    const failures = this.workerFailures[slot]! + 1;
    this.workerFailures[slot] = failures;
    this.respawnAt[slot] = performance.now() + (failures > 1 ? retryDelay(failures - 1) : 0);
  }

  /**
   * The running worker with the fewest requests in flight (so a silent one
   * soon stops getting more), round robin among equals; null while every slot
   * waits for a replacement.
   */
  private pickWorker(): number | null {
    const inFlight = this.workers.map(() => 0);
    for (const p of this.pending.values()) inFlight[p.slot] = inFlight[p.slot]! + 1;
    let best: number | null = null;
    for (let k = 0; k < this.workers.length; k++) {
      const slot = (this.nextWorker + k) % this.workers.length;
      if (this.workers[slot] && (best === null || inFlight[slot]! < inFlight[best]!)) best = slot;
    }
    if (best !== null) this.nextWorker = best + 1;
    return best;
  }

  private start(e: Entry, now: number): boolean {
    const slot = this.pickWorker();
    if (slot === null) return false;
    const id = this.nextId++;
    e.requestId = id;
    e.state = "loading";
    e.deadline = now + LOAD_DEADLINE_MS;
    this.pending.set(id, {
      slot,
      settle: (msg) => this.onMessage(e, id, msg),
      progress: () => {
        e.deadline = performance.now() + LOAD_DEADLINE_MS;
      },
    });
    const req: TileWorkerRequest = { type: "load", id, url: this.url(e.tile), mode: "tile" };
    this.workers[slot]!.postMessage(req);
    return true;
  }

  /** Nothing heard of a load in time: its worker hung or vanished, so it is replaced (its loads are retried). */
  private expire(e: Entry) {
    const p = this.pending.get(e.requestId);
    const w = p ? this.workers[p.slot] : null;
    if (p && w) this.replaceWorker(p.slot, w, `no answer about ${e.key} in ${LOAD_DEADLINE_MS / 1000} s`);
    else this.onMessage(e, e.requestId, { type: "error", id: e.requestId, message: "load lost", aborted: false });
  }

  private cancel(e: Entry) {
    const p = this.pending.get(e.requestId);
    if (e.state === "loading" && p) this.workers[p.slot]?.postMessage({ type: "cancel", id: e.requestId } satisfies TileWorkerRequest);
    this.pending.delete(e.requestId);
    this.entries.delete(e.key);
  }

  private onMessage(e: Entry, id: number, msg: TileWorkerResponse) {
    if (this.disposed || this.entries.get(e.key) !== e || e.requestId !== id) return;
    if (msg.type === "loaded") {
      const mats = this.opts.materialsFor(e.tile.level);
      const obj = buildTileObject(msg.tile, mats, e.key);
      obj.visible = false;
      obj.userData.tileKey = e.key;
      obj.userData.tileLevel = e.tile.level;
      e.object = obj;
      e.gpuBytes = msg.tile.gpuBytes;
      e.state = "ready";
      e.lastDrawn = this.frame;
      this.gpuTotal += e.gpuBytes;
      this.downloaded += msg.transferBytes;
      this.opts.root.add(obj);
      this.opts.onTileReady?.(e.key, obj);
    } else if (msg.type === "error") {
      if (msg.aborted) {
        this.entries.delete(e.key);
        return;
      }
      e.state = "error";
      e.errors++;
      e.retryAt = performance.now() + retryDelay(e.errors);
      console.warn(`[tiles] ${e.key}: ${msg.message}`);
    }
  }

  private evict() {
    if (this.gpuTotal <= this.opts.budgetBytes) return;
    // never what the current view refines through: those nodes and their
    // children (a refined node needs all four, and the siblings of drawn
    // tiles just outside the frustum come back on the smallest turn)
    const keep = new Set<string>();
    for (const key of this.refined) {
      keep.add(key);
      for (const c of childrenOf(parseTileKey(key))) keep.add(tileKey(c));
    }
    const candidates = [...this.entries.values()]
      .filter((e) => e.state === "ready" && e.object && !e.object.visible && !keep.has(e.key))
      .sort((a, b) => a.lastDrawn - b.lastDrawn);
    const target = this.opts.budgetBytes * 0.85;
    for (const e of candidates) {
      if (this.gpuTotal <= target) break;
      this.drop(e);
    }
  }

  private drop(e: Entry) {
    if (e.object) {
      this.opts.root.remove(e.object);
      disposeObject(e.object);
    }
    this.gpuTotal -= e.gpuBytes;
    this.entries.delete(e.key);
  }

  /** Load a whole multi-node scene (the horizon) through the worker pool. */
  loadScene(url: string): Promise<DecodedNode[]> {
    return new Promise((resolve, reject) => {
      const slot = this.pickWorker();
      if (slot === null) {
        reject(new Error("no tile worker is running"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, {
        slot,
        settle: (msg) => {
          if (msg.type === "scene") {
            this.downloaded += msg.transferBytes;
            resolve(msg.nodes);
          } else reject(new Error(msg.type === "error" ? msg.message : "unexpected reply"));
        },
      });
      this.workers[slot]!.postMessage({ type: "load", id, url, mode: "scene" } satisfies TileWorkerRequest);
    });
  }

  dispose() {
    this.disposed = true;
    for (const e of [...this.entries.values()]) if (e.state === "ready") this.drop(e);
    this.entries.clear();
    for (const w of this.workers) w?.terminate();
    this.workers = [];
    this.pending.clear();
  }
}
