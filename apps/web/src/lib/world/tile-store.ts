/**
 * Owns every streamed tile: worker pool, concurrency-limited loading with
 * cancellation, visibility, and a GPU-memory budget with LRU eviction.
 *
 * "Cached" (loaded, kept on the GPU) and "active" (drawn this frame) are
 * different states: tiles stay cached while invisible so panning back is
 * instant, until the byte budget forces the least recently drawn ones out.
 */
import * as THREE from "three";
import { tileKey, tilePath, type TileInfo } from "@geolausanne/geo-types";
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
  errors: number;
  retryAt: number;
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

export class TileStore {
  private entries = new Map<string, Entry>();
  private workers: Worker[] = [];
  private nextWorker = 0;
  private nextId = 1;
  private pending = new Map<number, (msg: TileWorkerResponse) => void>();
  private frame = 0;
  private downloaded = 0;
  private gpuTotal = 0;
  private drawnCount = 0;
  private disposed = false;

  constructor(private opts: TileStoreOptions) {
    for (let i = 0; i < opts.workerCount; i++) {
      const w = opts.createWorker();
      w.onmessage = (ev: MessageEvent<TileWorkerResponse>) => {
        const cb = this.pending.get(ev.data.id);
        if (cb) {
          this.pending.delete(ev.data.id);
          cb(ev.data);
        }
      };
      this.workers.push(w);
    }
  }

  isReady = (key: string): boolean => this.entries.get(key)?.state === "ready";

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
      else failed++;
    }
    return { cached, drawn: this.drawnCount, loading, gpuBytes: this.gpuTotal, downloadedBytes: this.downloaded, failed };
  }

  /** Meshes currently drawn (for raycasting). */
  drawnObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const e of this.entries.values()) if (e.object?.visible) out.push(e.object);
    return out;
  }

  url(tile: TileInfo): string {
    return `${this.opts.baseUrl}/${tilePath(tile)}?v=${encodeURIComponent(this.opts.version)}`;
  }

  update(result: LodResult, now: number) {
    if (this.disposed) return;
    this.frame++;
    const drawn = new Set(result.render.map(tileKey));
    this.drawnCount = drawn.size;
    for (const e of this.entries.values()) {
      if (!e.object) continue;
      const visible = drawn.has(e.key);
      e.object.visible = visible;
      if (visible) e.lastDrawn = this.frame;
    }

    let active = 0;
    for (const e of this.entries.values()) if (e.state === "loading") active++;
    for (const req of result.requests) {
      let e = this.entries.get(req.key);
      if (e) e.lastWanted = now;
      if (active >= this.opts.maxConcurrent) continue;
      if (!e) {
        e = {
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
        };
        this.entries.set(req.key, e);
        this.start(e);
        active++;
      } else if (e.state === "error" && e.errors < 4 && now >= e.retryAt) {
        e.state = "loading";
        this.start(e);
        active++;
      }
    }

    // cancel loads nobody asked for in the last 1.5 s (camera moved on)
    for (const e of this.entries.values()) {
      if (e.state === "loading" && now - e.lastWanted > 1500) this.cancel(e);
    }
    this.evict();
  }

  private start(e: Entry) {
    const id = this.nextId++;
    e.requestId = id;
    const worker = this.workers[this.nextWorker++ % this.workers.length]!;
    this.pending.set(id, (msg) => this.onMessage(e, id, msg));
    const req: TileWorkerRequest = { type: "load", id, url: this.url(e.tile), mode: "tile" };
    worker.postMessage(req);
  }

  private cancel(e: Entry) {
    for (const w of this.workers) w.postMessage({ type: "cancel", id: e.requestId } satisfies TileWorkerRequest);
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
      e.retryAt = performance.now() + 1000 * 2 ** e.errors;
      console.warn(`[tiles] ${e.key}: ${msg.message}`);
    }
  }

  private evict() {
    if (this.gpuTotal <= this.opts.budgetBytes) return;
    const candidates = [...this.entries.values()]
      .filter((e) => e.state === "ready" && e.object && !e.object.visible)
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
      const id = this.nextId++;
      this.pending.set(id, (msg) => {
        if (msg.type === "scene") {
          this.downloaded += msg.transferBytes;
          resolve(msg.nodes);
        } else reject(new Error(msg.type === "error" ? msg.message : "unexpected reply"));
      });
      const worker = this.workers[this.nextWorker++ % this.workers.length]!;
      worker.postMessage({ type: "load", id, url, mode: "scene" } satisfies TileWorkerRequest);
    });
  }

  dispose() {
    this.disposed = true;
    for (const e of [...this.entries.values()]) if (e.state === "ready") this.drop(e);
    this.entries.clear();
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.pending.clear();
  }
}
