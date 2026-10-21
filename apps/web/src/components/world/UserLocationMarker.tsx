"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { tileKeysAt } from "@/lib/world/lod";
import { LATER, surfaceAt } from "@/lib/world/picking";
import { worldRegistry } from "@/lib/world/registry";
import { useWorldStore } from "@/stores/world-store";

/** "You are here": a Léman-blue disc with a soft pulse, kept legible at any zoom. */
export function UserLocationMarker() {
  const location = useWorldStore((s) => s.userLocation);
  const manifest = useWorldStore((s) => s.manifest);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const resolvedY = useRef<number | null>(null);
  /** the drawn tile resolvedY was measured on */
  const measuredOn = useRef<string | null>(null);
  const resolvedFor = useRef<typeof location>(null);
  const keys = useMemo(() => (location && manifest ? tileKeysAt(manifest.lods, location.x, location.z) : []), [location, manifest]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || !location) return;
    if (resolvedFor.current !== location) {
      resolvedFor.current = location;
      resolvedY.current = null;
      measuredOn.current = null;
    }
    // measured again whenever another tile is drawn there (a finer level of detail)
    const tiles = worldRegistry.tiles;
    const drawn = tiles ? keys.find((k) => tiles.isDrawn(k)) : undefined;
    if (drawn && drawn !== measuredOn.current) {
      const hit = surfaceAt(location.x, location.z, { canWait: true });
      // LATER: a tile's BVH was just built, try again next frame
      if (hit !== LATER) {
        if (hit) resolvedY.current = hit.y;
        measuredOn.current = drawn;
      }
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
