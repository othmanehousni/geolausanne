// @vitest-environment node
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey, tilePath, type TileInfo } from "@geolausanne/geo-types";
import type { LodResult } from "../lod";
import { LOAD_DEADLINE_MS, TileStore } from "../tile-store";
import type { TileWorkerRequest, TileWorkerResponse } from "../tile.worker";

class FakeWorker {
  onmessage: ((ev: { data: TileWorkerResponse }) => void) | null = null;
  onerror: ((ev: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: TileWorkerRequest[] = [];
  terminated = false;
  postMessage(msg: TileWorkerRequest) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  send(data: TileWorkerResponse) {
    this.onmessage?.({ data });
  }
  crash() {
    this.onerror?.({ message: "boom", preventDefault() {} });
  }
}

const tile = (level: number, i: number, j: number): TileInfo => ({ level, i, j, minY: 0, maxY: 10, bytes: 100, empty: false, refinable: false });

const A = tile(0, 0, 0);
const B = tile(0, 1, 0);
const C = tile(0, 0, 1);
const D = tile(0, 1, 1);

function want(tiles: TileInfo[], opts: { render?: TileInfo[]; refined?: string[] } = {}): LodResult {
  return {
    render: opts.render ?? [],
    requests: tiles.map((t, k) => ({ key: tileKey(t), tile: t, priority: 100 - k })),
    refined: new Set(opts.refined ?? []),
  };
}

let now = 0;
let workers: FakeWorker[];
let store: TileStore;

function makeStore(opts: { workerCount?: number; budgetBytes?: number; maxConcurrent?: number } = {}) {
  workers = [];
  const mat = new THREE.MeshBasicMaterial();
  store = new TileStore({
    baseUrl: "/city",
    version: "v1",
    root: new THREE.Group(),
    materialsFor: () => ({ voxel: mat, water: mat }),
    budgetBytes: opts.budgetBytes ?? 1e9,
    maxConcurrent: opts.maxConcurrent ?? 4,
    workerCount: opts.workerCount ?? 1,
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return store;
}

/** Frames every 100 ms until `until`, the camera asking for `result` all along. */
function run(until: number, result: LodResult) {
  while (now < until) {
    now = Math.min(until, now + 100);
    store.update(result, now);
  }
}

/** The latest load of `t`, and the worker it went to. */
function lastLoad(t: TileInfo) {
  for (let k = workers.length - 1; k >= 0; k--) {
    const w = workers[k]!;
    const load = w.posted.findLast((m) => m.type === "load" && m.url.includes(tilePath(t)));
    if (load) return { worker: w, id: load.id };
  }
  return null;
}

const loadCount = (t: TileInfo) => workers.flatMap((w) => w.posted).filter((m) => m.type === "load" && m.url.includes(tilePath(t))).length;

function fail(t: TileInfo) {
  const l = lastLoad(t)!;
  l.worker.send({ type: "error", id: l.id, message: "Failed to fetch", aborted: false });
}

function succeed(t: TileInfo, gpuBytes = 100) {
  const l = lastLoad(t)!;
  l.worker.send({ type: "loaded", id: l.id, transferBytes: 10, tile: { translation: [0, 0, 0], scale: 1, primitives: [], instances: [], gpuBytes } });
}

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  store.dispose();
  vi.restoreAllMocks();
});

describe("TileStore retries", () => {
  it("keeps retrying a failed tile for as long as it is wanted, then every minute", () => {
    makeStore();
    const r = want([A]);
    store.update(r, now);
    // waits after each failure: 2, 4, 8 s, then 30 s, then 60 s for good
    for (const wait of [2000, 4000, 8000, 30_000, 60_000, 60_000]) {
      const loads = loadCount(A);
      fail(A);
      run(now + wait - 200, r);
      expect(loadCount(A)).toBe(loads);
      run(now + 300, r);
      expect(loadCount(A)).toBe(loads + 1);
    }
    succeed(A);
    expect(store.isReady(tileKey(A))).toBe(true);
    expect(store.stats().failed).toBe(0);
  });

  it("reports wanted tiles that fail, also while they are retried", () => {
    makeStore();
    const r = want([A, B]);
    store.update(r, now);
    fail(A);
    expect(store.stats()).toMatchObject({ failed: 1, loading: 1 });
    expect(store.hasFailed(tileKey(A))).toBe(true);
    expect(store.hasFailed(tileKey(B))).toBe(false);
    run(2100, r);
    expect(store.stats()).toMatchObject({ failed: 1, loading: 2 });
    succeed(A);
    expect(store.stats().failed).toBe(0);
  });

  it("forgets a failed tile nobody wants any more and starts afresh when it is wanted again", () => {
    makeStore();
    store.update(want([A]), now);
    for (let k = 0; k < 4; k++) {
      fail(A);
      run(now + 20_000, want([A]));
    }
    fail(A);
    run(now + 2000, want([]));
    expect(store.stats().failed).toBe(0);
    const loads = loadCount(A);
    store.update(want([A]), now);
    expect(loadCount(A)).toBe(loads + 1);
  });

  it("retries at once when asked (back online, or the visitor's “try again”)", () => {
    makeStore();
    const r = want([A]);
    store.update(r, now);
    fail(A);
    run(now + 1000, r);
    expect(loadCount(A)).toBe(1);
    store.retryNow();
    store.update(r, now);
    expect(loadCount(A)).toBe(2);
  });
});

describe("TileStore workers", () => {
  it("fails the loads of a crashed worker as retryable and replaces it", () => {
    makeStore({ workerCount: 2 });
    const r = want([A, B]);
    store.update(r, now);
    const crashed = lastLoad(A)!.worker;
    expect(lastLoad(B)!.worker).not.toBe(crashed);
    crashed.crash();
    expect(crashed.terminated).toBe(true);
    expect(store.hasFailed(tileKey(A))).toBe(true);
    run(now + 100, r);
    expect(workers).toHaveLength(3);
    run(now + 2000, r);
    expect(lastLoad(A)!.worker).not.toBe(crashed);
    succeed(A);
    expect(store.isReady(tileKey(A))).toBe(true);
  });

  it("replaces a worker that stays silent, and retries its loads elsewhere", () => {
    makeStore({ workerCount: 2 });
    const r = want([A]);
    store.update(r, now);
    const silent = lastLoad(A)!.worker;
    run(LOAD_DEADLINE_MS - 100, r);
    expect(silent.terminated).toBe(false);
    run(LOAD_DEADLINE_MS + 200, r);
    expect(silent.terminated).toBe(true);
    expect(store.hasFailed(tileKey(A))).toBe(true);
    run(now + 2100, r);
    expect(lastLoad(A)!.worker).not.toBe(silent);
  });

  it("gives a slow download that still receives data all the time it needs", () => {
    makeStore();
    const r = want([A]);
    store.update(r, now);
    const w = lastLoad(A)!.worker;
    while (now < 3 * LOAD_DEADLINE_MS) {
      run(now + 5000, r);
      w.send({ type: "progress", id: lastLoad(A)!.id });
    }
    expect(w.terminated).toBe(false);
    expect(loadCount(A)).toBe(1);
  });

  it("sends new loads to the least busy worker, so a silent one does not take them all", () => {
    makeStore({ workerCount: 2, maxConcurrent: 2 });
    const tiles = [A, B, C, D, tile(0, 2, 2), tile(0, 3, 3)];
    store.update(want(tiles), now);
    const busy = lastLoad(A)!.worker;
    const answering = lastLoad(B)!.worker;
    expect(answering).not.toBe(busy);
    // `answering` keeps answering, `busy` never does
    for (let k = 0; k < 4; k++) {
      const next = tiles.find((t) => !store.isReady(tileKey(t)) && lastLoad(t)?.worker === answering && !store.hasFailed(tileKey(t)));
      if (next) succeed(next);
      store.update(want(tiles), (now += 100));
    }
    expect(busy.posted.filter((m) => m.type === "load")).toHaveLength(1);
    expect(tiles.filter((t) => store.isReady(tileKey(t)))).toHaveLength(4);
  });

  it("waits longer and longer for a worker that fails before it ever answers", () => {
    makeStore();
    workers[0]!.crash();
    store.update(want([A]), (now += 16));
    expect(workers).toHaveLength(2);
    workers[1]!.crash();
    run(now + 1500, want([]));
    expect(workers).toHaveLength(2);
    run(now + 600, want([]));
    expect(workers).toHaveLength(3);
  });
});

describe("TileStore eviction", () => {
  const root = { ...tile(1, 0, 0), refinable: true };
  const kids = [A, B, C, D];
  const other = tile(0, 9, 9);

  /** Six tiles of 100 bytes loaded; `other` was drawn last, so plain LRU would keep it. */
  function loadAll(refined: string[]) {
    makeStore({ maxConcurrent: 8 });
    const tiles = [other, root, ...kids];
    store.update(want(tiles), now);
    for (const t of tiles) succeed(t);
    store.update(want([], { render: [other] }), (now += 16));
    store.update(want([], { refined }), (now += 16));
    // a quality step lowers the budget
    store.setLimits(450, 8);
  }

  it("keeps the nodes the view refines through and their children", () => {
    loadAll([tileKey(root)]);
    expect(store.isReady(tileKey(other))).toBe(false);
    for (const t of [root, ...kids]) expect(store.isReady(tileKey(t))).toBe(true);
  });

  it("drops the least recently drawn tiles otherwise", () => {
    loadAll([]);
    expect(store.isReady(tileKey(other))).toBe(true);
    expect(store.stats().gpuBytes).toBeLessThanOrEqual(450 * 0.85);
  });
});
