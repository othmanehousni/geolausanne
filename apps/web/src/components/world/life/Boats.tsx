"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BOAT_SIZE, boatAt, LAKE_ROUTES, voyage, type BoatKind, type BoatState } from "@/lib/world/life/boats";
import { boatMaterial, wakeMaterial } from "@/lib/world/life/life-materials";
import { motorModel, sailModel, shuttleModel, steamerModel, wakeQuads } from "@/lib/world/life/models";
import { voxelGeometry } from "@/lib/world/life/voxel-model";
import { useWorldStore } from "@/stores/world-store";

const MODELS: Record<BoatKind, () => ReturnType<typeof steamerModel>> = {
  steamer: steamerModel,
  shuttle: shuttleModel,
  sail: sailModel,
  motor: motorModel,
};
/** boats farther than this from the camera are not drawn (the fog has them) */
const FAR = 12_000;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _s = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * CGN boats on Lake Geneva on their timetable (paddle steamers to Vevey and
 * towards Morges, the Évian shuttle), and with `small`, sailing boats and a
 * motor boat in the bay with their wakes. One instanced draw call per kind
 * of boat. With reduced motion they hold still where they are.
 */
export function Boats({ small }: { small: boolean }) {
  const voyages = useMemo(() => LAKE_ROUTES.filter((r) => small || r.kind === "steamer" || r.kind === "shuttle").map(voyage), [small]);
  const fleet = useMemo(() => {
    const material = boatMaterial();
    const kinds = (Object.keys(MODELS) as BoatKind[]).filter((k) => voyages.some((v) => v.route.kind === k));
    const meshes = kinds.map((kind) => {
      const mesh = new THREE.InstancedMesh(voxelGeometry(MODELS[kind]()), material, voyages.filter((v) => v.route.kind === kind).length);
      mesh.name = `boats-${kind}`;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return { kind, mesh };
    });
    let wakes: THREE.InstancedMesh | null = null;
    if (small) {
      const q = wakeQuads();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(q.positions, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(q.positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(q.colors, 4));
      g.setIndex(q.indices);
      wakes = new THREE.InstancedMesh(g, wakeMaterial(), voyages.length);
      wakes.name = "boat-wakes";
      wakes.frustumCulled = false;
      wakes.renderOrder = 1;
      wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    // each voyage's mesh and instance
    const slots = voyages.map((v) => {
      const mesh = meshes.find((e) => e.kind === v.route.kind)!.mesh;
      const index = voyages.filter((o) => o.route.kind === v.route.kind).indexOf(v);
      return { mesh, index };
    });
    return { material, meshes, wakes, slots };
  }, [voyages, small]);

  useEffect(
    () => () => {
      for (const { mesh } of fleet.meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      fleet.material.dispose();
      if (fleet.wakes) {
        fleet.wakes.geometry.dispose();
        (fleet.wakes.material as THREE.Material).dispose();
        fleet.wakes.dispose();
      }
    },
    [fleet],
  );

  /** the timetable's clock, held while motion is reduced */
  const frozen = useRef<number | null>(null);
  const state = useMemo<BoatState>(() => ({ x: 0, z: 0, heading: 0, speed: 0 }), []);

  useFrame(({ camera }) => {
    const reduced = useWorldStore.getState().reducedMotion;
    const now = Date.now() / 1000;
    if (reduced) frozen.current ??= now;
    else frozen.current = null;
    const t = frozen.current ?? now;
    voyages.forEach((v, n) => {
      const { kind } = v.route;
      const { mesh, index } = fleet.slots[n]!;
      boatAt(v, t, state);
      const size = BOAT_SIZE[kind];
      const d = Math.hypot(state.x - camera.position.x, camera.position.y, state.z - camera.position.z);
      if (d > FAR) {
        mesh.setMatrixAt(index, HIDDEN);
        fleet.wakes?.setMatrixAt(n, HIDDEN);
        return;
      }
      // seen from afar a boat grows a little, as map symbols do: a yacht
      // would otherwise be a single pixel from the shore
      const grow = kind === "sail" || kind === "motor" ? THREE.MathUtils.clamp(d / 350, 1, 3.2) : THREE.MathUtils.clamp(d / 1200, 1, 1.8);
      // a gentle swell; yachts heel in the breeze
      const swell = reduced ? 0 : Math.sin(t * 0.9 + n * 1.7);
      const heel = kind === "sail" ? 0.16 * Math.sin(state.heading - Math.PI / 4) : 0.012 * swell;
      _e.set(kind === "sail" || kind === "motor" ? 0.02 * swell : 0.004 * swell, -state.heading, heel);
      _q.setFromEuler(_e);
      _p.set(state.x, 0.12 * swell, state.z);
      mesh.setMatrixAt(index, _m.compose(_p, _q, _s.setScalar(grow)));
      if (fleet.wakes) {
        if (state.speed < 0.3) {
          fleet.wakes.setMatrixAt(n, HIDDEN);
        } else {
          // the V starts at the stern and grows with the speed
          const length = grow * size.length * (0.9 + 1.9 * Math.min(1, state.speed / v.route.speed));
          const stern = (grow * size.length) / 2;
          _p.set(state.x - Math.sin(state.heading) * stern, 0.08, state.z + Math.cos(state.heading) * stern);
          _e.set(0, -state.heading, 0);
          _q.setFromEuler(_e);
          fleet.wakes.setMatrixAt(n, _m.compose(_p, _q, _s.set(length, 1, length)));
        }
      }
    });
    for (const { mesh } of fleet.meshes) mesh.instanceMatrix.needsUpdate = true;
    if (fleet.wakes) fleet.wakes.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="boats">
      {fleet.meshes.map(({ kind, mesh }) => (
        <primitive key={kind} object={mesh} />
      ))}
      {fleet.wakes ? <primitive object={fleet.wakes} /> : null}
    </group>
  );
}
