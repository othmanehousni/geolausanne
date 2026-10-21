"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TileIndex } from "@geolausanne/geo-types";
import { CITY_BASE_URL, QUALITY } from "@/lib/world/config";
import { createTileWorker } from "@/lib/world/create-worker";
import { selectTiles, tileIndexFor } from "@/lib/world/lod";
import { createVoxelMaterial, createWaterMaterial, worldUniforms } from "@/lib/world/materials";
import { worldRegistry } from "@/lib/world/registry";
import { TileStore } from "@/lib/world/tile-store";
import { useWorldStore } from "@/stores/world-store";

const DEG = Math.PI / 180;

/** Streams the voxel city: LOD selection every frame, loading in workers. */
export function CityTiles() {
  const manifest = useWorldStore((s) => s.manifest);
  const quality = useWorldStore((s) => s.quality);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const tilesAttempt = useWorldStore((s) => s.tilesAttempt);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const root = useRef<THREE.Group>(null);
  const store = useRef<TileStore | null>(null);
  const index = useRef<TileIndex | null>(null);
  const refined = useRef<Set<string>>(new Set());
  const lastStats = useRef(0);

  const materials = useMemo(
    () => ({
      lod: [1, 2, 4, 8].map((v) => createVoxelMaterial(v)),
      water: createWaterMaterial(),
    }),
    [],
  );

  useEffect(() => () => {
    materials.lod.forEach((m) => m.dispose());
    materials.water.dispose();
  }, [materials]);

  useEffect(() => {
    worldUniforms.uSway.value = reducedMotion ? 0 : 1;
  }, [reducedMotion]);

  useEffect(() => {
    if (!manifest || !root.current) return;
    // the quality at creation time; later changes are applied by setLimits below
    const preset = QUALITY[useWorldStore.getState().quality];
    index.current = tileIndexFor(manifest);
    refined.current = new Set();
    const s = new TileStore({
      baseUrl: CITY_BASE_URL,
      version: manifest.version,
      root: root.current,
      materialsFor: (level) => ({ voxel: materials.lod[level] ?? materials.lod[0]!, water: materials.water }),
      budgetBytes: preset.budgetMB * 1024 * 1024,
      maxConcurrent: preset.maxConcurrent,
      workerCount: Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 2)),
      createWorker: createTileWorker,
      onTileReady: () => invalidate(),
    });
    store.current = s;
    worldRegistry.tiles = s;
    // back online: retry the blocks that failed now rather than at their next backoff
    const online = () => {
      s.retryNow();
      invalidate();
    };
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      s.dispose();
      if (worldRegistry.tiles === s) worldRegistry.tiles = null;
      store.current = null;
    };
  }, [manifest, materials, invalidate]);

  // a quality step (PerformanceMonitor, low-memory devices) must not reload the city
  useEffect(() => {
    const preset = QUALITY[quality];
    store.current?.setLimits(preset.budgetMB * 1024 * 1024, preset.maxConcurrent);
  }, [quality]);

  // "try again" on the status pill
  useEffect(() => {
    if (tilesAttempt === 0) return;
    store.current?.retryNow();
    invalidate();
  }, [tilesAttempt, invalidate]);

  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreen = useMemo(() => new THREE.Matrix4(), []);
  const box = useMemo(() => new THREE.Box3(), []);

  useFrame((_, delta) => {
    // water ripples (and swaying trees) hold still when motion is reduced
    if (!reducedMotion) worldUniforms.uTime.value += Math.min(delta, 0.1);
    const s = store.current;
    const idx = index.current;
    if (!s || !idx) return;
    // the controls moved the camera this frame; three refreshes its matrices only when rendering
    camera.updateMatrixWorld();
    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    const result = selectTiles(
      idx,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov * DEG, viewportHeight: size.height },
      (b) => {
        box.min.set(b.minX, b.minY - 2, b.minZ);
        box.max.set(b.maxX, b.maxY + 30, b.maxZ);
        return frustum.intersectsBox(box);
      },
      s.isReady,
      refined.current,
      { maxVoxelPx: QUALITY[quality].maxVoxelPx, hysteresis: 0.72, prefetch: 0.7 },
    );
    refined.current = result.refined;
    const now = performance.now();
    s.update(result, now);
    if (now - lastStats.current > 400) {
      lastStats.current = now;
      const st = useWorldStore.getState();
      st.setStats(s.stats());
      if (!st.firstViewReady && result.render.length > 0) {
        // blocks that failed to load do not hold the first view back (MapStatus reports them)
        let waiting = 0;
        for (const r of result.requests) if (!s.hasFailed(r.key)) waiting++;
        if (waiting < 4) st.setFirstViewReady(true);
      }
    }
  });

  return <group ref={root} name="city-tiles" />;
}
