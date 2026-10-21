"use client";

import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { useEffect } from "react";
import * as THREE from "three";
import { parseManifest } from "@geolausanne/geo-types";
import { CITY_BASE_URL, QUALITY } from "@/lib/world/config";
import { installBvh } from "@/lib/world/picking";
import { useWorldStore } from "@/stores/world-store";
import { Atmosphere } from "./Atmosphere";
import { CameraRig } from "./CameraRig";
import { CityTiles } from "./CityTiles";
import { Horizon } from "./Horizon";
import { PlacementPicker } from "./PlacementPicker";
import { PlaceMarkers } from "./PlaceMarkers";
import { UserLocationMarker } from "./UserLocationMarker";

/**
 * The full-viewport 3D city. Loaded client-side only (next/dynamic). The
 * accessible name, role and keyboard support live on the wrapping map region
 * (see MapRegion), so the canvas itself is hidden from assistive technology.
 */
export default function VoxelWorld() {
  const quality = useWorldStore((s) => s.quality);
  const setQuality = useWorldStore((s) => s.setQuality);
  const setManifest = useWorldStore((s) => s.setManifest);
  const manifestAttempt = useWorldStore((s) => s.manifestAttempt);
  const setReducedMotion = useWorldStore((s) => s.setReducedMotion);

  useEffect(() => {
    installBvh();
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [setReducedMotion]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${CITY_BASE_URL}/manifest.json`, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`manifest HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => !cancelled && setManifest(parseManifest(json)))
      .catch((err: unknown) => !cancelled && setManifest(null, err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [setManifest, manifestAttempt]);

  const preset = QUALITY[quality];

  return (
    <Canvas
      aria-hidden="true"
      dpr={preset.dpr}
      gl={{ antialias: preset.antialias, alpha: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 45, near: 1, far: 90_000, position: [0, 800, 1200] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
      }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <PerformanceMonitor
        onDecline={() => {
          const q = useWorldStore.getState().quality;
          if (q === "high") setQuality("medium");
          else if (q === "medium") setQuality("low");
        }}
      />
      <AdaptiveDpr pixelated={false} />
      <Atmosphere />
      <CameraRig />
      <CityTiles />
      <Horizon />
      <PlaceMarkers />
      <UserLocationMarker />
      <PlacementPicker />
    </Canvas>
  );
}
