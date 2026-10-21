/** Turn decoded tile buffers into three.js objects (main thread, cheap). */
import * as THREE from "three";
import type { DecodedNode, DecodedPrimitive, DecodedTile } from "./tile-format";

export interface TileMaterials {
  voxel: THREE.Material;
  water: THREE.Material;
}

export function primitiveGeometry(p: DecodedPrimitive): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(p.colors, 4, true));
  g.setIndex(new THREE.BufferAttribute(p.indices, 1));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(...p.min), new THREE.Vector3(...p.max));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function buildTileObject(tile: DecodedTile, mats: TileMaterials, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...tile.translation);
  group.scale.setScalar(tile.scale);
  for (const p of tile.primitives) {
    const mesh = new THREE.Mesh(primitiveGeometry(p), p.material === "water" ? mats.water : mats.voxel);
    mesh.name = p.material;
    mesh.userData.pickable = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  for (const inst of tile.instances) {
    const count = inst.translations.length / 3;
    const mesh = new THREE.InstancedMesh(primitiveGeometry(inst.primitive), mats.voxel, count);
    mesh.name = inst.name;
    mesh.userData.pickable = false;
    for (let i = 0; i < count; i++) {
      _p.set(inst.translations[i * 3]!, inst.translations[i * 3 + 1]!, inst.translations[i * 3 + 2]!);
      if (inst.rotations) _q.set(inst.rotations[i * 4]!, inst.rotations[i * 4 + 1]!, inst.rotations[i * 4 + 2]!, inst.rotations[i * 4 + 3]!);
      else _q.identity();
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  group.matrixAutoUpdate = false;
  return group;
}

export function buildSceneObject(nodes: DecodedNode[], materialFor: (node: DecodedNode, p: DecodedPrimitive) => THREE.Material): THREE.Group {
  const root = new THREE.Group();
  for (const n of nodes) {
    const g = new THREE.Group();
    g.name = n.name;
    g.position.set(...n.translation);
    g.scale.set(...n.scale);
    for (const p of n.primitives) {
      const mesh = new THREE.Mesh(primitiveGeometry(p), materialFor(n, p));
      mesh.name = p.material;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      g.add(mesh);
    }
    root.add(g);
  }
  root.updateMatrixWorld(true);
  return root;
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) {
      const bvh = (mesh.geometry as THREE.BufferGeometry & { disposeBoundsTree?: () => void }).disposeBoundsTree;
      bvh?.call(mesh.geometry);
      mesh.geometry.dispose();
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}
