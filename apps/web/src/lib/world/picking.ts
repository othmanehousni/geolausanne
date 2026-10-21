/**
 * Ray casting against streamed tiles, accelerated with three-mesh-bvh.
 * BVHs are built lazily, only for meshes a ray actually reaches.
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

const _sphere = new THREE.Sphere();

/** Pickable tile meshes (terrain, buildings, water) that are currently drawn. */
export function pickableMeshes(): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const obj of worldRegistry.tiles?.drawnObjects() ?? []) {
    for (const child of obj.children) {
      const m = child as THREE.Mesh;
      if (m.isMesh && m.userData.pickable) out.push(m);
    }
  }
  return out;
}

export function raycastTiles(raycaster: THREE.Raycaster): THREE.Intersection | null {
  installBvh();
  const ray = raycaster.ray;
  let best: THREE.Intersection | null = null;
  (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  for (const mesh of pickableMeshes()) {
    const geom = mesh.geometry;
    if (!geom.boundingSphere) geom.computeBoundingSphere();
    _sphere.copy(geom.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    if (!ray.intersectsSphere(_sphere)) continue;
    if (!(geom as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree) geom.computeBoundsTree();
    const hits = raycaster.intersectObject(mesh, false);
    const hit = hits[0];
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}

const _down = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3(0, -1, 0);

/** Height (world y) of the top surface under (x, z), or null when no tile is loaded there. */
export function surfaceHeightAt(x: number, z: number): number | null {
  _origin.set(x, 6000, z);
  _down.set(_origin, _dir);
  _down.far = 12_000;
  const hit = raycastTiles(_down);
  return hit ? hit.point.y : null;
}
