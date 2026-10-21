"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { tileKeysAt } from "@/lib/world/lod";
import { DOT_SPRITE, HALO_FRAMES, haloSpriteName, markerAtlas } from "@/lib/world/marker-atlas";
import { markerTexelSize } from "@/lib/world/marker-screen";
import { LATER, surfaceAt } from "@/lib/world/picking";
import { worldRegistry } from "@/lib/world/registry";
import { SpriteBatch } from "@/lib/world/sprite-batch";
import { useWorldStore } from "@/stores/world-store";

/** one pulse of the halo, seconds */
const PULSE = 2;

/**
 * "You are here": a pixel-art Léman-blue dot with a white ring and a halo
 * that pulses outwards in eight frames (one still frame with reduced
 * motion), kept the same size on screen at any zoom. Drawn under the spot
 * badges, over the city.
 */
export function UserLocationMarker() {
  const location = useWorldStore((s) => s.userLocation);
  const manifest = useWorldStore((s) => s.manifest);
  const resolvedY = useRef<number | null>(null);
  /** the drawn tile resolvedY was measured on */
  const measuredOn = useRef<string | null>(null);
  const resolvedFor = useRef<typeof location>(null);
  const keys = useMemo(() => (location && manifest ? tileKeysAt(manifest.lods, location.x, location.z) : []), [location, manifest]);
  const batch = useMemo(() => new SpriteBatch(2, { name: "user-location", renderOrder: 15 }), []);
  useEffect(() => () => batch.dispose(), [batch]);
  const sprites = useMemo(() => {
    const atlas = markerAtlas();
    return { dot: atlas.sprites.get(DOT_SPRITE)!, halo: Array.from({ length: HALO_FRAMES }, (_, f) => atlas.sprites.get(haloSpriteName(f))!) };
  }, []);

  useFrame(({ clock, camera }) => {
    batch.begin();
    if (location) {
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
      const distance = Math.hypot(location.x - camera.position.x, y - camera.position.y, location.z - camera.position.z);
      const texel = markerTexelSize(distance, batch.pxPerCss);
      const frame = useWorldStore.getState().reducedMotion ? 2 : Math.floor(((clock.elapsedTime % PULSE) / PULSE) * HALO_FRAMES);
      batch.push(location.x, y, location.z, sprites.halo[frame]!, texel);
      batch.push(location.x, y, location.z, sprites.dot, texel);
    }
    batch.end();
  });

  return <primitive object={batch.mesh} />;
}
