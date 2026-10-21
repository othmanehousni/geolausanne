import { advance, createRoot, events, extend, type ReconcilerRoot } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseManifest, type CityManifest } from "@geolausanne/geo-types";
import { lifeUniforms } from "@/lib/world/life/life-materials";
import { useWorldStore } from "@/stores/world-store";
import { Life } from "../Life";

/** The life layer in a real React Three Fiber root (the renderer is a stand-in). */

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
  tiles: [],
  horizon: null,
} as unknown as CityManifest);

let now = 0;
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
let scene: THREE.Scene;

async function mount() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const r = createRoot(canvas);
  root = r;
  const gl = { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {}, dispose() {} } as unknown as THREE.WebGLRenderer;
  await r.configure({ gl, events, frameloop: "never", dpr: 1, size: { width: 800, height: 600, top: 0, left: 0 }, camera: { fov: 45, near: 1, far: 90_000, position: [0, 600, 2600] } });
  await act(async () => {
    scene = r.render(<Life />).getState().scene;
  });
  frame();
}

function frame(ms = 16) {
  now += ms;
  act(() => advance(now));
}

/** Meshes the life layer draws (one draw call each), by name. */
function drawn() {
  const out: string[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.visible) out.push(o.name);
  });
  return out.sort();
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE as unknown as Parameters<typeof extend>[0]);
});

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  useWorldStore.setState({ manifest, quality: "high", reducedMotion: false });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Life", () => {
  it("draws boats, birds and clouds in a handful of instanced draw calls", async () => {
    await mount();
    expect(drawn()).toEqual(["birds", "boat-wakes", "boats-motor", "boats-sail", "boats-shuttle", "boats-steamer", "clouds"]);
  });

  it("keeps only the big boats on the low preset", async () => {
    useWorldStore.setState({ quality: "low" });
    await mount();
    expect(drawn()).toEqual(["boats-shuttle", "boats-steamer"]);
  });

  it("holds still with reduced motion: boats stop, birds rest, clouds stay", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_792_504_650_000);
    useWorldStore.setState({ reducedMotion: true });
    await mount();
    expect(drawn()).not.toContain("birds");
    const steamers = scene.getObjectByName("boats-steamer") as THREE.InstancedMesh;
    const before = new THREE.Matrix4();
    steamers.getMatrixAt(0, before);
    const time = lifeUniforms.uLifeTime.value;
    vi.setSystemTime(1_792_504_650_000 + 60_000);
    for (let i = 0; i < 10; i++) frame();
    const after = new THREE.Matrix4();
    steamers.getMatrixAt(0, after);
    expect(after.equals(before)).toBe(true);
    expect(lifeUniforms.uLifeTime.value).toBe(time);
    // motion again: the timetable resumes from the clock
    act(() => useWorldStore.setState({ reducedMotion: false }));
    frame();
    steamers.getMatrixAt(0, after);
    expect(after.equals(before)).toBe(false);
  });
});
