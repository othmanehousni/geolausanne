import { advance, createRoot, events, extend, type ReconcilerRoot } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseManifest, type CityManifest } from "@geolausanne/geo-types";
import type { Place } from "@/lib/data/types";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";
import { PlaceMarkers } from "../PlaceMarkers";

/**
 * The markers run in a real React Three Fiber root; only the WebGL renderer
 * is a stand-in. They are drawn by a vertex shader, so pointer events are
 * tested in screen space: these tests click where a badge is drawn.
 */

// the name tags are decorative and own a separate React DOM root
vi.mock("@react-three/drei", () => ({ Html: () => null }));

const W = 800;
const H = 600;
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

/** A spot at world (x, 0, z). */
function place(id: string, x: number, z: number, extra: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    category: "restaurant",
    cuisine: [],
    lon: 0,
    lat: 0,
    easting: 2538000 + x,
    northing: 1152000 - z,
    elevation: 372,
    address: null,
    website: null,
    phone: null,
    opening_hours: null,
    description: null,
    halal_level: "full",
    certification: "community",
    certifier: null,
    certification_verified: false,
    serves_alcohol: null,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    confirmations: 0,
    last_confirmed_at: null,
    review_count: 0,
    avg_rating: null,
    status: "active",
    removed_at: null,
    source: "community",
    created_at: "2026-10-21T00:00:00Z",
    creator_name: null,
    is_mine: false,
    my_vote: null,
    ...extra,
  };
}

let now = 0;
let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
let canvas: HTMLCanvasElement;
let camera: THREE.PerspectiveCamera;

async function mount() {
  canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: W });
  Object.defineProperty(canvas, "clientHeight", { value: H });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON() {} });
  document.body.appendChild(canvas);
  const r = createRoot(canvas);
  root = r;
  const gl = { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {}, dispose() {} } as unknown as THREE.WebGLRenderer;
  await r.configure({ gl, events, frameloop: "never", dpr: 1, size: { width: W, height: H, top: 0, left: 0 }, camera: { fov: 45, near: 1, far: 90_000 } });
  await act(async () => {
    camera = r.render(<PlaceMarkers />).getState().camera as THREE.PerspectiveCamera;
  });
  // 400 m south of the spots, 300 m up, looking at them
  camera.position.set(0, 300, 400);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  frame();
}

function frame(ms = 16) {
  now += ms;
  act(() => advance(now));
}

/** Where a spot's badge is drawn: a little above its anchor (the tip). */
function badgeAt(x: number, z: number) {
  const p = new THREE.Vector3(x, 0, z).project(camera);
  return { x: (p.x + 1) * 0.5 * W, y: (1 - p.y) * 0.5 * H - 18 };
}

function pointer(type: string, x: number, y: number, opts: { id?: number; pointerType?: string } = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  for (const [k, v] of Object.entries({ pointerId: opts.id ?? 1, pointerType: opts.pointerType ?? "mouse", isPrimary: true })) Object.defineProperty(ev, k, { value: v });
  canvas.dispatchEvent(ev);
}

function click(x: number, y: number, pointerType = "mouse") {
  pointer("pointerdown", x, y, { pointerType });
  pointer("pointerup", x, y, { pointerType });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE as unknown as Parameters<typeof extend>[0]);
});

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  useWorldStore.setState({ manifest, picking: false, reducedMotion: false });
  usePlacesStore.setState({ places: [place("west", -120, 0), place("east", 120, 0), place("behind", 0, 900)], hoveredId: null });
  useUiStore.setState({ selectedPlaceId: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  canvas.remove();
  vi.restoreAllMocks();
});

describe("PlaceMarkers picking", () => {
  it("selects the spot whose badge is clicked or tapped", async () => {
    await mount();
    const east = badgeAt(120, 0);
    click(east.x, east.y);
    expect(useUiStore.getState().selectedPlaceId).toBe("east");
    const west = badgeAt(-120, 0);
    // a finger may land a little beside the badge
    click(west.x - 20, west.y, "touch");
    expect(useUiStore.getState().selectedPlaceId).toBe("west");
  });

  it("ignores drags, empty ground, markers behind the camera and clicks while placing a spot", async () => {
    await mount();
    const east = badgeAt(120, 0);
    pointer("pointerdown", east.x, east.y);
    pointer("pointerup", east.x + 30, east.y);
    expect(useUiStore.getState().selectedPlaceId).toBeNull();
    click(W / 2, H / 2);
    expect(useUiStore.getState().selectedPlaceId).toBeNull();
    // "behind" projects to the screen through the camera's back: nothing there
    const ghost = new THREE.Vector3(0, 0, 900).project(camera);
    click((ghost.x + 1) * 0.5 * W, (1 - ghost.y) * 0.5 * H - 18);
    expect(useUiStore.getState().selectedPlaceId).toBeNull();
    act(() => useWorldStore.setState({ picking: true }));
    frame();
    click(east.x, east.y);
    expect(useUiStore.getState().selectedPlaceId).toBeNull();
  });

  it("hovers the badge under the mouse, and leaves the list's hover alone", async () => {
    await mount();
    const west = badgeAt(-120, 0);
    pointer("pointermove", west.x, west.y);
    frame();
    expect(usePlacesStore.getState().hoveredId).toBe("west");
    expect(canvas.style.cursor).toBe("pointer");
    pointer("pointermove", W / 2, H - 20);
    frame();
    expect(usePlacesStore.getState().hoveredId).toBeNull();
    expect(canvas.style.cursor).toBe("");
    // a row of the spots list hovers "east"; the mouse over empty map does not undo it
    act(() => usePlacesStore.getState().setHovered("east"));
    pointer("pointermove", W / 2, H - 40);
    frame();
    expect(usePlacesStore.getState().hoveredId).toBe("east");
    // touch has no hover
    pointer("pointermove", west.x, west.y, { pointerType: "touch" });
    frame();
    expect(usePlacesStore.getState().hoveredId).toBe("east");
  });

  it("follows badges that move under a still mouse while the view changes", async () => {
    await mount();
    const east = badgeAt(120, 0);
    pointer("pointermove", east.x, east.y);
    frame();
    expect(usePlacesStore.getState().hoveredId).toBe("east");
    // the camera turns: the badge leaves the pointer
    camera.position.set(400, 300, 400);
    camera.lookAt(0, 0, 0);
    frame();
    expect(usePlacesStore.getState().hoveredId).not.toBe("east");
  });
});
