"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
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
import { PixelArt } from "./PixelArt";
import { PlacementPicker } from "./PlacementPicker";
import { PlaceMarkers } from "./PlaceMarkers";
import { UserLocationMarker } from "./UserLocationMarker";
import { ViewportInsets } from "./ViewportInsets";

/**
 * Every frame while the map is visible. While a modal covers it the city
 * renders on demand only (resizes, finished tiles), and the performance
 * monitor is unmounted so that sparse frames are not taken for a slow device.
 * A sustained frame-rate drop steps the quality preset down; the tiles already
 * loaded stay (CityTiles only adopts the new limits).
 */
function Pacing() {
  const covered = useWorldStore((s) => s.coveredBy > 0);
  const setQuality = useWorldStore((s) => s.setQuality);
  const setFrameloop = useThree((s) => s.setFrameloop);

  useEffect(() => {
    setFrameloop(covered ? "demand" : "always");
  }, [covered, setFrameloop]);

  if (covered) return null;
  return (
    <PerformanceMonitor
      onDecline={() => {
        const q = useWorldStore.getState().quality;
        if (q === "high") setQuality("medium");
        else if (q === "medium") setQuality("low");
      }}
    />
  );
}

/**
 * The full-viewport 3D city. Loaded client-side only (next/dynamic). The
 * accessible name, role and keyboard support live on the wrapping map region
 * (see MapRegion), so the canvas itself is hidden from assistive technology.
 */
export default function VoxelWorld() {
  const quality = useWorldStore((s) => s.quality);
  const setManifest = useWorldStore((s) => s.setManifest);
  const manifestAttempt = useWorldStore((s) => s.manifestAttempt);
  const setPrefersReducedMotion = useWorldStore((s) => s.setPrefersReducedMotion);

  useEffect(() => {
    // `?debug` exposes the world store (tile statistics, quality) to the
    // console for measurements on real devices (docs/operations/performance.md)
    if (new URLSearchParams(location.search).has("debug")) {
      (window as Window & { geolausanne?: unknown }).geolausanne = { world: useWorldStore };
    }
  }, []);

  useEffect(() => {
    installBvh();
    // the system setting; the visitor can also pause motion (world store)
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [setPrefersReducedMotion]);

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
      <Pacing />
      <PixelArt />
      <Atmosphere />
      <CameraRig />
      <ViewportInsets />
      <CityTiles />
      <Horizon />
      <PlaceMarkers />
      <UserLocationMarker />
      <PlacementPicker />
    </Canvas>
  );
}
