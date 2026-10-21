import { advance, createRoot, events, extend, type ReconcilerRoot } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseManifest, type CityManifest, type TileRow } from "@geolausanne/geo-types";
import { worldUniforms } from "@/lib/world/materials";
import type { TileWorkerResponse } from "@/lib/world/tile.worker";
import { useWorldStore } from "@/stores/world-store";
import { CityTiles } from "../CityTiles";

/** Workers that only record requests; tests answer them. */
const pool = vi.hoisted(() => {
  class FakeWorker {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onerror: unknown = null;
    onmessageerror: unknown = null;
    posted: { type: string; id: number; url?: string }[] = [];
    postMessage(msg: { type: string; id: number; url?: string }) {
      this.posted.push(msg);
    }
    terminate() {}
  }
  return { FakeWorker, workers: [] as FakeWorker[] };
});

vi.mock("@/lib/world/create-worker", () => ({
  createTileWorker: () => {
    const w = new pool.FakeWorker();
    pool.workers.push(w);
    return w;
  },
}));

/** Five 256 m roots in a row along x, 1 km apart. */
const ROOTS = [0, 4, 8, 12, 16];
const manifest = parseManifest({
  format: "geolausanne-voxel-city",
  formatVersion: 1,
  version: "test",
  origin: { easting: 2538000, northing: 1152000, elevation: 372 },
  rootLevel: 1,
  lods: [
    { level: 0, voxelSize: 1, tileSize: 128 },
    { level: 1, voxelSize: 2, tileSize: 256 },
  ],
  bounds: { lv95: [2530000, 1140000, 2550000, 1160000], wgs84: [0, 0, 0, 0] },
  tiles: ROOTS.map((i): TileRow => [1, i, 0, 0, 10, 100]),
  horizon: null,
} as unknown as CityManifest);

let now = 0;
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
let camera: THREE.PerspectiveCamera;

async function mount() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const r = createRoot(canvas);
  root = r;
  const gl = { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {}, dispose() {} } as unknown as THREE.WebGLRenderer;
  await r.configure({ gl, events, frameloop: "never", dpr: 1, size: { width: 800, height: 600, top: 0, left: 0 }, camera: { fov: 45, near: 1, far: 90_000 } });
  await act(async () => {
    camera = r.render(<CityTiles />).getState().camera as THREE.PerspectiveCamera;
  });
}

function frame(ms = 16) {
  now += ms;
  act(() => advance(now));
}

/** Tile files requested so far, e.g. "lod1/4_0". */
const requested = () =>
  pool.workers.flatMap((w) => w.posted).flatMap((m) => (m.type === "load" && m.url ? [m.url.replace(/^.*\/(lod\d\/[^.]+)\.glb.*$/, "$1")] : []));

function answer(file: string, ok: boolean) {
  for (const w of pool.workers) {
    const m = w.posted.findLast((p) => p.type === "load" && p.url?.includes(`/${file}.glb`));
    if (!m) continue;
    const data: TileWorkerResponse = ok
      ? { type: "loaded", id: m.id, transferBytes: 1, tile: { translation: [0, 0, 0], scale: 1, primitives: [], instances: [], gpuBytes: 100 } }
      : { type: "error", id: m.id, message: "Failed to fetch", aborted: false };
    act(() => w.onmessage?.({ data }));
    return;
  }
  throw new Error(`${file} was not requested`);
}

/** Turn the camera to the middle of root `i` (like the controls: the world matrix waits for a render). */
function lookAtRoot(i: number) {
  camera.lookAt(i * 256 + 128, 0, -128);
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // <Canvas> does this; a bare root needs it for <group>
  extend(THREE as unknown as Parameters<typeof extend>[0]);
});

beforeEach(() => {
  now = 1000;
  pool.workers.length = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  useWorldStore.setState({ manifest, quality: "high", reducedMotion: false, firstViewReady: false, tilesAttempt: 0 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
});

describe("CityTiles", () => {
  it("culls with the camera as turned in this frame, not as last rendered", async () => {
    await mount();
    camera.position.set(1100, 300, 600);
    lookAtRoot(0);
    camera.updateMatrixWorld();
    frame();
    expect(requested()).not.toContain("lod1/8_0");
    lookAtRoot(8);
    frame();
    expect(requested()).toContain("lod1/8_0");
  });

  it("is ready when what loaded is drawn, even though some blocks failed", async () => {
    await mount();
    // high above the middle root, all five in view
    camera.position.set(2176, 6000, 3000);
    camera.lookAt(2176, 0, -128);
    camera.updateMatrixWorld();
    frame();
    expect(requested()).toHaveLength(5);
    answer("lod1/8_0", true);
    for (const i of [0, 4, 12, 16]) answer(`lod1/${i}_0`, false);
    for (let t = 0; t < 500; t += 16) frame();
    expect(useWorldStore.getState().firstViewReady).toBe(true);
    expect(useWorldStore.getState().stats).toMatchObject({ drawn: 1, failed: 4 });
  });

  it("retries failed blocks as soon as the network is back", async () => {
    await mount();
    camera.position.set(128, 300, 600);
    lookAtRoot(0);
    camera.updateMatrixWorld();
    frame();
    answer("lod1/0_0", false);
    frame();
    expect(requested()).toHaveLength(1);
    act(() => void window.dispatchEvent(new Event("online")));
    frame();
    expect(requested()).toEqual(["lod1/0_0", "lod1/0_0"]);
  });

  it("holds the water still when motion is reduced", async () => {
    await mount();
    frame();
    const t0 = worldUniforms.uTime.value;
    frame();
    expect(worldUniforms.uTime.value).toBeGreaterThan(t0);
    act(() => useWorldStore.setState({ reducedMotion: true }));
    const t1 = worldUniforms.uTime.value;
    frame();
    frame();
    expect(worldUniforms.uTime.value).toBe(t1);
    expect(worldUniforms.uSway.value).toBe(0);
  });
});
