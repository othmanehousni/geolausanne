import { advance, createRoot, events, type ReconcilerRoot } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { worldRegistry } from "@/lib/world/registry";
import type { TileStore } from "@/lib/world/tile-store";
import { useWorldStore } from "@/stores/world-store";
import { CameraRig } from "../CameraRig";

/**
 * The rig runs in a real React Three Fiber root with the real drei
 * MapControls; only the WebGL renderer is a stand-in (jsdom has no WebGL).
 */

type Controls = { target: THREE.Vector3; enableDamping: boolean };

let now = 0;
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
let canvas: HTMLCanvasElement;

function fakeRenderer(el: HTMLCanvasElement) {
  return {
    domElement: el,
    render() {},
    setSize() {},
    setPixelRatio() {},
    dispose() {},
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
  } as unknown as THREE.WebGLRenderer;
}

async function mount() {
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 800 });
  Object.defineProperty(canvas, "clientHeight", { value: 600 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} });
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  document.body.appendChild(canvas);
  const r = createRoot(canvas);
  root = r;
  await r.configure({ gl: fakeRenderer(canvas), events, frameloop: "never", dpr: 1, size: { width: 800, height: 600, top: 0, left: 0 } });
  let state!: ReturnType<ReturnType<typeof r.render>["getState"]>;
  await act(async () => {
    state = r.render(<CameraRig />).getState();
  });
  frame();
  return { camera: state.camera, controls: state.controls as unknown as Controls, rerender: () => act(() => void r.render(<CameraRig />)) };
}

/** One frame `ms` after the previous one. */
function frame(ms = 16) {
  now += ms;
  act(() => advance(now));
}

function frames(total: number) {
  for (let t = 0; t < total; t += 16) frame();
}

/** Camera azimuth around the target, radians (0 = looking north). */
function azimuth(camera: THREE.Camera, c: Controls) {
  return Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
}

function pointer(type: string, target: EventTarget, x: number, y: number, id: number, button = 0) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  for (const [k, v] of Object.entries({ pointerId: id, pointerType: "mouse", pageX: x, pageY: y })) Object.defineProperty(ev, k, { value: v });
  target.dispatchEvent(ev);
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  useWorldStore.setState({ command: null, reducedMotion: false, manifest: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  canvas.remove();
  worldRegistry.tiles = null;
  vi.restoreAllMocks();
});

describe("CameraRig pointer controls", () => {
  it("keep working after a re-render in the middle of a drag", async () => {
    const { camera, controls, rerender } = await mount();
    controls.enableDamping = false;
    // a drag is under way when the rig re-renders (manifest arrival, quality step)
    pointer("pointerdown", canvas, 100, 100, 7);
    pointer("pointermove", canvas, 150, 120, 7);
    frame();
    rerender();
    pointer("pointerup", canvas, 150, 120, 7);
    frame();

    const before = camera.position.clone();
    pointer("pointerdown", canvas, 100, 100, 8);
    pointer("pointermove", canvas, 300, 200, 8);
    frame();
    pointer("pointerup", canvas, 300, 200, 8);
    frame();
    expect(camera.position.distanceTo(before)).toBeGreaterThan(50);

    const beforeWheel = camera.position.clone();
    canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -300, clientX: 400, clientY: 300 }));
    frame();
    expect(camera.position.distanceTo(beforeWheel)).toBeGreaterThan(10);
  });

  it("drop inertia when motion is reduced", async () => {
    const { controls } = await mount();
    expect(controls.enableDamping).toBe(true);
    act(() => useWorldStore.setState({ reducedMotion: true }));
    expect(controls.enableDamping).toBe(false);
  });
});

describe("CameraRig keyboard and toolbar steps", () => {
  it("add up quick presses instead of dropping them", async () => {
    const { camera, controls } = await mount();
    const start = azimuth(camera, controls);
    const step = Math.PI / 12;
    for (let i = 0; i < 3; i++) {
      act(() => useWorldStore.getState().send({ kind: "rotate", radians: step }));
      frames(100);
    }
    frames(400);
    expect(azimuth(camera, controls) - start).toBeCloseTo(3 * step, 3);
  });

  it("finish a step in about a quarter of a second", async () => {
    const { camera, controls } = await mount();
    const distance = camera.position.distanceTo(controls.target);
    act(() => useWorldStore.getState().send({ kind: "zoom", factor: 0.6 }));
    frames(160);
    // an ease-out: most of the way at once
    expect(camera.position.distanceTo(controls.target)).toBeLessThan(distance * 0.65);
    frames(100);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance * 0.6, 1);
  });

  it("turn around the target when facing north again, not across it", async () => {
    const { camera, controls } = await mount();
    act(() => useWorldStore.setState({ reducedMotion: true }));
    act(() => useWorldStore.getState().send({ kind: "rotate", radians: Math.PI - azimuth(camera, controls) }));
    frame();
    act(() => useWorldStore.setState({ reducedMotion: false }));
    const ground = (v: THREE.Vector3) => Math.hypot(v.x - controls.target.x, v.z - controls.target.z);
    const radius = ground(camera.position);
    act(() => useWorldStore.getState().send({ kind: "resetNorth" }));
    for (let t = 0; t < 300; t += 16) {
      frame();
      expect(ground(camera.position) / radius).toBeCloseTo(1, 2);
    }
    expect(azimuth(camera, controls)).toBeCloseTo(0, 3);
  });

  it("are instant with reduced motion", async () => {
    const { camera, controls } = await mount();
    act(() => useWorldStore.setState({ reducedMotion: true }));
    const distance = camera.position.distanceTo(controls.target);
    act(() => useWorldStore.getState().send({ kind: "zoom", factor: 0.5 }));
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance * 0.5, 3);
  });
});

describe("CameraRig ground following", () => {
  /** Ground at y = 0 west of x = 1000 and y = 300 east of it, as drawn tiles. */
  function drawGround() {
    const tile = (x: number, y: number) => {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
      mesh.position.set(x, y, 0);
      mesh.userData.pickable = true;
      g.add(mesh);
      g.userData.tileKey = `0/${x}/0`;
      g.updateMatrixWorld(true);
      return g;
    };
    const tiles = [tile(0, 0), tile(2000, 300)];
    worldRegistry.tiles = { drawnObjects: () => tiles } as unknown as TileStore;
  }

  it("probes the ground of the new place right after an instant move", async () => {
    drawGround();
    const { controls } = await mount();
    act(() => useWorldStore.setState({ reducedMotion: true }));
    act(() => useWorldStore.getState().send({ kind: "flyTo", target: { x: 0, y: 0, z: 0, distance: 400 } }));
    frames(100);
    expect(controls.target.y).toBeCloseTo(0, 3);
    // an instant move to the hill, less than 300 ms after the last ground probe
    act(() => useWorldStore.getState().send({ kind: "flyTo", target: { x: 2000, y: 300, z: 0, distance: 400 } }));
    for (let i = 0; i < 6; i++) {
      frame();
      expect(controls.target.y).toBeCloseTo(300, 3);
    }
  });
});
