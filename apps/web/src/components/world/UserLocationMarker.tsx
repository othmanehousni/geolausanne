"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { surfaceHeightAt } from "@/lib/world/picking";
import { useWorldStore } from "@/stores/world-store";

/** "You are here": a Léman-blue disc with a soft pulse, kept legible at any zoom. */
export function UserLocationMarker() {
  const location = useWorldStore((s) => s.userLocation);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const resolvedY = useRef<number | null>(null);
  const resolvedFor = useRef<typeof location>(null);
  const lastProbe = useRef(0);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || !location) return;
    if (resolvedFor.current !== location) {
      resolvedFor.current = location;
      resolvedY.current = null;
    }
    const now = performance.now();
    if (resolvedY.current === null && now - lastProbe.current > 500) {
      lastProbe.current = now;
      resolvedY.current = surfaceHeightAt(location.x, location.z);
    }
    const y = resolvedY.current ?? location.y;
    g.position.set(location.x, y + 0.4, location.z);
    const size = Math.max(2.5, camera.position.distanceTo(g.position) * 0.012);
    g.scale.setScalar(size);
    if (halo.current) {
      const k = reducedMotion ? 0.5 : (clock.elapsedTime % 2) / 2;
      halo.current.scale.setScalar(1 + k * 1.6);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
    }
  });

  if (!location) return null;
  return (
    <group ref={group} name="user-location">
      <mesh rotation-x={-Math.PI / 2} raycast={() => null} renderOrder={10}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} raycast={() => null} renderOrder={11}>
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial color="#2f7fd6" depthTest={false} transparent />
      </mesh>
      <mesh ref={halo} rotation-x={-Math.PI / 2} raycast={() => null} renderOrder={9}>
        <ringGeometry args={[0.9, 1.25, 40]} />
        <meshBasicMaterial color="#2f7fd6" depthTest={false} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
