/**
 * Ray casting against streamed tiles, accelerated with three-mesh-bvh.
 * BVHs are built lazily, only for meshes a ray actually reaches: tiles are
 * tried nearest first, and only while they can still beat the best hit.
 * Building one takes 5–40 ms, so probes that can wait (pin heights, the
 * ground under the camera, hover) build at most about one per frame.
 */
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { worldRegistry } from "./registry";

declare module "three" {
  interface BufferGeometry {
    computeBoundsTree: typeof computeBoundsTree;
    disposeBoundsTree: typeof disposeBoundsTree;
  }
}

let installed = false;
export function installBvh() {
  if (installed) return;
  installed = true;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

/** The answer of a probe that may wait when it would have to build a BVH right after another one. */
export const LATER = "later";
export type Later = typeof LATER;

/** Probes that can wait leave this long after a BVH build before the next one. */
const BUILD_GAP_MS = 12;
let lastBuild = -Infinity;

interface RaycastOptions {
  /** tile groups to test (default: the drawn ones) */
  objects?: THREE.Object3D[];
  /** answer LATER instead of building a BVH right after another one */
  canWait?: boolean;
}

/** Pickable tile meshes (terrain, buildings, water) of the given tiles, the drawn ones by default. */
export function pickableMeshes(objects = worldRegistry.tiles?.drawnObjects() ?? []): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const obj of objects) {
    for (const child of obj.children) {
      const m = child as THREE.Mesh;
      if (m.isMesh && m.userData.pickable) out.push(m);
    }
  }
  return out;
}

const _box = new THREE.Box3();
const _entry = new THREE.Vector3();

export function raycastTiles(raycaster: THREE.Raycaster, opts?: RaycastOptions & { canWait?: false }): THREE.Intersection | null;
export function raycastTiles(raycaster: THREE.Raycaster, opts: RaycastOptions): THREE.Intersection | null | Later;
export function raycastTiles(raycaster: THREE.Raycaster, opts: RaycastOptions = {}): THREE.Intersection | null | Later {
  installBvh();
  const ray = raycaster.ray;
  (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  // where the ray enters each mesh's world box: meshes it misses cost nothing
  const candidates: { mesh: THREE.Mesh; distance: number }[] = [];
  for (const mesh of pickableMeshes(opts.objects)) {
    const geom = mesh.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    _box.copy(geom.boundingBox!).applyMatrix4(mesh.matrixWorld);
    if (!ray.intersectBox(_box, _entry)) continue;
    // (from inside a box, intersectBox answers the exit point)
    const distance = _box.containsPoint(ray.origin) ? 0 : ray.origin.distanceTo(_entry);
    if (distance <= raycaster.far) candidates.push({ mesh, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  let best: THREE.Intersection | null = null;
  for (const { mesh, distance } of candidates) {
    if (best && distance > best.distance) break;
    const geom = mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown };
    if (!geom.boundsTree) {
      if (opts.canWait && performance.now() - lastBuild < BUILD_GAP_MS) return LATER;
      geom.computeBoundsTree();
      lastBuild = performance.now();
    }
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}

export interface SurfaceHit {
  /** world y of the top surface (roof or ground) */
  y: number;
  /** the tile hit, and its level of detail (0 = finest) */
  key: string;
  level: number;
}

const _down = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3(0, -1, 0);

function probe(x: number, z: number, opts: RaycastOptions): SurfaceHit | null | Later {
  _origin.set(x, 6000, z);
  _down.set(_origin, _dir);
  _down.far = 12_000;
  const hit = raycastTiles(_down, opts);
  if (hit === LATER || !hit) return hit;
  const tile = hit.object.parent;
  return { y: hit.point.y, key: tile?.userData.tileKey ?? "", level: tile?.userData.tileLevel ?? 0 };
}

/** Top surface under (x, z) on the drawn tiles, or null when none is drawn there. */
export function surfaceAt(x: number, z: number): SurfaceHit | null;
export function surfaceAt(x: number, z: number, opts: { canWait: boolean }): SurfaceHit | null | Later;
export function surfaceAt(x: number, z: number, opts: { canWait?: boolean } = {}): SurfaceHit | null | Later {
  return probe(x, z, opts);
}

/** Height (world y) of the top surface under (x, z), or null when no tile is drawn there. */
export function surfaceHeightAt(x: number, z: number): number | null {
  return surfaceAt(x, z)?.y ?? null;
}

/**
 * Top surface under (x, z) on the finest tile loaded there, drawn or cached:
 * a place the camera has not reached yet may still be in the cache.
 */
export function loadedSurfaceAt(x: number, z: number): SurfaceHit | null {
  const byLevel = new Map<number, THREE.Object3D[]>();
  for (const obj of worldRegistry.tiles?.loadedObjects() ?? []) {
    const level: number = obj.userData.tileLevel ?? 0;
    const list = byLevel.get(level);
    if (list) list.push(obj);
    else byLevel.set(level, [obj]);
  }
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const hit = probe(x, z, { objects: byLevel.get(level) });
    if (hit && hit !== LATER) return hit;
  }
  return null;
}
