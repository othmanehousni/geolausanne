// @vitest-environment node
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LATER, raycastTiles, surfaceAt } from "../picking";
import { worldRegistry } from "../registry";
import type { TileStore } from "../tile-store";

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/** Horizontal squares of side `size` at each height, as one geometry. */
function slabs(size: number, ys: number[]) {
  const h = size / 2;
  const pos: number[] = [];
  for (const y of ys) pos.push(-h, y, -h, -h, y, h, h, y, h, -h, y, -h, h, y, h, h, y, -h);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** A drawn tile holding one pickable mesh. */
function tile(geometry: THREE.BufferGeometry, x: number, key: string, level = 0) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = x;
  mesh.userData.pickable = true;
  g.add(mesh);
  g.userData.tileKey = key;
  g.userData.tileLevel = level;
  g.updateMatrixWorld(true);
  return { group: g, mesh };
}

function draw(...tiles: { group: THREE.Group }[]) {
  const groups = tiles.map((t) => t.group);
  worldRegistry.tiles = { drawnObjects: () => groups } as unknown as TileStore;
}

const hasBvh = (m: THREE.Mesh) => Boolean((m.geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree);

let now = 10_000;
beforeEach(() => {
  // well after any BVH built by a previous test
  now += 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  worldRegistry.tiles = null;
  vi.restoreAllMocks();
});

describe("surfaceAt", () => {
  it("builds a BVH only for the tile under the probe, and says which tile answered", () => {
    const a = tile(slabs(100, [5]), 0, "0/0/0");
    const b = tile(slabs(100, [7]), 200, "1/1/0", 1);
    draw(a, b);
    expect(surfaceAt(10, 10)).toEqual({ y: 5, key: "0/0/0", level: 0 });
    expect(hasBvh(a.mesh)).toBe(true);
    expect(hasBvh(b.mesh)).toBe(false);
    expect(surfaceAt(210, 0)).toEqual({ y: 7, key: "1/1/0", level: 1 });
    expect(surfaceAt(1000, 0)).toBeNull();
  });

  it("builds at most one BVH per frame for probes that can wait", () => {
    const a = tile(slabs(100, [5]), 0, "0/0/0");
    const b = tile(slabs(100, [7]), 200, "0/1/0");
    draw(a, b);
    expect(surfaceAt(0, 0, { canWait: true })).toMatchObject({ y: 5 });
    expect(surfaceAt(200, 0, { canWait: true })).toBe(LATER);
    // a probe that cannot wait (a click) is answered anyway
    expect(surfaceAt(200, 0)).toMatchObject({ y: 7 });
    expect(surfaceAt(0, 0, { canWait: true })).toMatchObject({ y: 5 });
    now += 16;
    const c = tile(slabs(100, [9]), 400, "0/2/0");
    draw(a, b, c);
    expect(surfaceAt(400, 0, { canWait: true })).toMatchObject({ y: 9 });
  });
});

describe("raycastTiles", () => {
  it("stops at the nearest hit without building the BVHs of tiles behind it", () => {
    const near = tile(new THREE.BoxGeometry(100, 100, 100), 0, "0/0/0");
    const far = tile(new THREE.BoxGeometry(100, 100, 100), 300, "0/2/0");
    draw(far, near);
    // a ray through both boxes
    const ray = new THREE.Raycaster(new THREE.Vector3(-200, 0, 0), new THREE.Vector3(1, 0, 0));
    expect(raycastTiles(ray)?.point.x).toBeCloseTo(-50);
    expect(hasBvh(near.mesh)).toBe(true);
    expect(hasBvh(far.mesh)).toBe(false);
  });

  it("finds the nearest hit when the ray starts inside a tile's box", () => {
    // the camera floats between the floor (y = 0) and a roof (y = 100) of one tile
    const around = tile(slabs(1000, [-100, 0, 100]), 0, "0/0/0");
    const below = tile(slabs(10, [-50]), 0, "0/1/0");
    draw(below, around);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0));
    expect(raycastTiles(ray)?.point.y).toBeCloseTo(0);
  });
});
