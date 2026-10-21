"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { birdPose, FLAP_RATE, FLOCKS, hash01, type BirdPose, type Flock } from "@/lib/world/life/birds";
import { birdMaterial, lifeUniforms } from "@/lib/world/life/life-materials";
import { birdModel } from "@/lib/world/life/models";
import { voxelGeometry } from "@/lib/world/life/voxel-model";
import { finestTileAt, tileIndexFor } from "@/lib/world/lod";
import { worldUniforms } from "@/lib/world/materials";
import { LATER, surfaceAt } from "@/lib/world/picking";
import { useWorldStore } from "@/stores/world-store";

/** colour of each kind: the model is a white gull, pigeons are tinted blue-grey */
const TINT = { gull: new THREE.Color(1, 1, 1), pigeon: new THREE.Color(0.62, 0.66, 0.74) };
/** real size of each kind against the 1.3 m gull model */
const SIZE = { gull: 1, pigeon: 0.55 };
/** smallest wingspan on screen, CSS pixels: a bird a little smaller than a spot's badge */
const SPAN_PX = { gull: 16, pigeon: 13 };
/** birds farther than this are not drawn */
const FAR = 5000;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _s = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Bird {
  flock: Flock;
  /** index in its flock */
  i: number;
  /** wing beat: phase, rate (rad/s) */
  phase: number;
  rate: number;
}

/**
 * Pigeons circling over the parks and gulls along the shore, in one
 * instanced draw call. Kept the size of a few pixels at any zoom (a real
 * bird would vanish from 500 m), and resting at night. Not mounted with
 * reduced motion.
 */
export function Birds({ count }: { count: number }) {
  const manifest = useWorldStore((s) => s.manifest);
  const birds = useMemo(() => {
    const out: Bird[] = [];
    // whole flocks, in the order of FLOCKS, while the budget lasts
    for (const flock of FLOCKS) {
      if (out.length + flock.count > count) continue;
      for (let i = 0; i < flock.count; i++) out.push({ flock, i, phase: hash01(out.length * 31 + 7) * 6.28, rate: FLAP_RATE[flock.kind] * Math.PI * 2 * (0.9 + 0.2 * hash01(out.length)) });
    }
    return out;
  }, [count]);

  const mesh = useMemo(() => {
    const geometry = voxelGeometry(birdModel());
    const flap = new THREE.InstancedBufferAttribute(new Float32Array(birds.length * 3), 3);
    flap.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFlap", flap);
    const m = new THREE.InstancedMesh(geometry, birdMaterial(), Math.max(1, birds.length));
    m.name = "birds";
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    birds.forEach((b, n) => m.setColorAt(n, TINT[b.flock.kind]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  }, [birds]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );

  /** ground under each flock: a guess from the manifest, then the drawn surface */
  const ground = useRef(new Map<string, { y: number; measured: boolean }>());
  const nextProbe = useRef(0);
  const pose = useMemo<BirdPose>(() => ({ x: 0, y: 0, z: 0, heading: 0, bank: 0, flap: 0 }), []);

  useEffect(() => {
    ground.current = new Map();
    if (!manifest) return;
    const index = tileIndexFor(manifest);
    for (const f of FLOCKS) {
      const tile = f.overWater ? null : finestTileAt(index, f.centre.x, f.centre.z);
      ground.current.set(f.id, { y: tile ? tile.minY + (tile.maxY - tile.minY) * 0.4 : 0, measured: Boolean(f.overWater) });
    }
  }, [manifest]);

  useFrame(({ camera, clock, size }) => {
    // CSS pixels per metre at one metre from the camera
    const pxPerMetre = size.height / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
    // one flock's ground measured on the drawn tiles from time to time
    const now = clock.elapsedTime;
    if (now > nextProbe.current) {
      nextProbe.current = now + 1;
      const f = FLOCKS.find((fl) => ground.current.get(fl.id)?.measured === false);
      if (f) {
        const hit = surfaceAt(f.centre.x, f.centre.z, { canWait: true });
        if (hit !== LATER && hit) ground.current.set(f.id, { y: hit.y, measured: true });
      }
    }
    // birds rest at night
    const awake = 1 - THREE.MathUtils.smoothstep(worldUniforms.uNight.value, 0.35, 0.65);
    mesh.visible = awake > 0;
    if (!mesh.visible) return;
    const t = lifeUniforms.uLifeTime.value;
    const flap = mesh.geometry.getAttribute("aFlap") as THREE.InstancedBufferAttribute;
    birds.forEach((b, n) => {
      birdPose(b.flock, b.i, t, pose);
      const y = (ground.current.get(b.flock.id)?.y ?? 0) + pose.y;
      const d = Math.hypot(pose.x - camera.position.x, y - camera.position.y, pose.z - camera.position.z);
      if (d > FAR) {
        mesh.setMatrixAt(n, HIDDEN);
        return;
      }
      // real size up close, never smaller than a few pixels on screen
      const scale = Math.max(SIZE[b.flock.kind], (SPAN_PX[b.flock.kind] * d) / pxPerMetre / 1.3) * awake;
      _e.set(0, -pose.heading, -pose.bank);
      _q.setFromEuler(_e);
      _p.set(pose.x, y, pose.z);
      mesh.setMatrixAt(n, _m.compose(_p, _q, _s.setScalar(scale)));
      flap.setXYZ(n, b.phase, b.rate, pose.flap ? 0.62 : 0.05);
    });
    mesh.count = birds.length;
    mesh.instanceMatrix.needsUpdate = true;
    flap.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
