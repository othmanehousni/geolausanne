"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CITY_BASE_URL } from "@/lib/world/config";
import { buildSceneObject, disposeObject } from "@/lib/world/geometry";
import { createVoxelMaterial, createWaterMaterial } from "@/lib/world/materials";
import { worldRegistry } from "@/lib/world/registry";
import { useWorldStore } from "@/stores/world-store";

/** Waits before loading the horizon again after a failure. */
const RETRY_MS = [2000, 4000, 8000, 30_000, 60_000];

/**
 * Low-resolution backdrop (lake, Jura, Alps) plus a far water ring so the
 * lake meets the sky instead of ending at the data edge.
 */
export function Horizon() {
  const manifest = useWorldStore((s) => s.manifest);
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const water = useMemo(() => createWaterMaterial(), []);
  const ring = useMemo(() => {
    const g = new THREE.RingGeometry(30_000, 120_000, 64, 1);
    const n = g.getAttribute("position").count;
    const colors = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) colors.set([74, 143, 203, 128], i * 4);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 4, true));
    return g;
  }, []);

  useEffect(() => {
    if (!manifest?.horizon) return;
    let cancelled = false;
    let obj: THREE.Object3D | null = null;
    let loading = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mats = new Map<string, THREE.Material>();
    const tryLoad = () => {
      if (cancelled || obj || loading) return;
      const tiles = worldRegistry.tiles;
      if (!tiles) {
        timer = setTimeout(tryLoad, 200);
        return;
      }
      loading = true;
      tiles
        .loadScene(`${CITY_BASE_URL}/${manifest.horizon!.path}?v=${encodeURIComponent(manifest.version)}`)
        .then((nodes) => {
          loading = false;
          if (cancelled || !group.current) return;
          obj = buildSceneObject(nodes, (node, prim) => {
            if (prim.material === "water") return water;
            const key = node.scale.join("x");
            let m = mats.get(key);
            if (!m) {
              m = createVoxelMaterial(new THREE.Vector3(...node.scale));
              mats.set(key, m);
            }
            return m;
          });
          group.current.add(obj);
          worldRegistry.horizon = obj;
          invalidate();
        })
        .catch((err) => {
          loading = false;
          console.warn("[horizon]", err);
          // like the city's blocks: try again later, and at once when the browser is back online
          if (!cancelled) timer = setTimeout(tryLoad, RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]);
        });
    };
    const retryNow = () => {
      clearTimeout(timer);
      tryLoad();
    };
    window.addEventListener("online", retryNow);
    tryLoad();
    const parent = group.current;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", retryNow);
      if (obj) {
        parent?.remove(obj);
        disposeObject(obj);
      }
      mats.forEach((m) => m.dispose());
      worldRegistry.horizon = null;
    };
  }, [manifest, water, invalidate]);

  return (
    <group ref={group} name="horizon">
      {/* far lake ring beneath the horizon mesh, fades into the fog */}
      <mesh rotation-x={-Math.PI / 2} position-y={-1.2} material={water} geometry={ring} renderOrder={-10} />
    </group>
  );
}
