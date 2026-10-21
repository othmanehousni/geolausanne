"use client";

import { create } from "zustand";
import type { CityManifest } from "@geolausanne/geo-types";
import { detectQuality } from "@/lib/world/config";
import type { TileStoreStats } from "@/lib/world/tile-store";

export type Quality = "low" | "medium" | "high";

export interface CameraTarget {
  /** world-space point to look at */
  x: number;
  y: number;
  z: number;
  /** desired camera distance from the target (metres) */
  distance?: number;
  /** azimuth in radians (0 = looking north), optional */
  azimuth?: number;
  /** polar angle from the zenith in radians, optional */
  polar?: number;
}

export type CameraCommand =
  | { kind: "flyTo"; target: CameraTarget; id: number }
  | { kind: "zoom"; factor: number; id: number }
  | { kind: "rotate"; radians: number; id: number }
  | { kind: "tilt"; radians: number; id: number }
  | { kind: "resetNorth"; id: number }
  /** pan relative to the current heading: +forward moves north when facing north */
  | { kind: "pan"; forward: number; right: number; id: number }
  | { kind: "home"; id: number };

export interface CameraView {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  distance: number;
  /** heading in degrees, 0 = north, clockwise */
  heading: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

interface WorldState {
  manifest: CityManifest | null;
  manifestError: string | null;
  setManifest(m: CityManifest | null, error?: string | null): void;
  /** bumped to refetch the manifest after an error */
  manifestAttempt: number;
  retryManifest(): void;
  /** WebGL unavailable or the renderer crashed */
  renderError: "no-webgl" | "crashed" | null;
  setRenderError(e: WorldState["renderError"]): void;

  stats: TileStoreStats;
  setStats(s: TileStoreStats): void;
  firstViewReady: boolean;
  setFirstViewReady(v: boolean): void;

  night: boolean;
  setNight(v: boolean): void;
  quality: Quality;
  setQuality(q: Quality): void;
  reducedMotion: boolean;
  setReducedMotion(v: boolean): void;

  view: CameraView | null;
  setView(v: CameraView): void;

  command: CameraCommand | null;
  send(cmd: DistributiveOmit<CameraCommand, "id">): void;

  /** "pick" mode lets the user click the map to choose a location */
  picking: boolean;
  setPicking(v: boolean): void;
  pickedPoint: WorldPoint | null;
  setPickedPoint(p: WorldPoint | null): void;
  hoverPoint: WorldPoint | null;
  setHoverPoint(p: WorldPoint | null): void;

  /** the visitor's position from the Geolocation API, in world space */
  userLocation: WorldPoint | null;
  setUserLocation(p: WorldPoint | null): void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

let commandId = 0;

export const useWorldStore = create<WorldState>((set) => ({
  manifest: null,
  manifestError: null,
  setManifest: (manifest, error = null) => set({ manifest, manifestError: error }),
  manifestAttempt: 0,
  retryManifest: () => set((s) => ({ manifestError: null, manifestAttempt: s.manifestAttempt + 1 })),
  renderError: null,
  setRenderError: (renderError) => set({ renderError }),

  stats: { cached: 0, drawn: 0, loading: 0, gpuBytes: 0, downloadedBytes: 0, failed: 0 },
  setStats: (stats) => set({ stats }),
  firstViewReady: false,
  setFirstViewReady: (firstViewReady) => set({ firstViewReady }),

  night: false,
  setNight: (night) => set({ night }),
  // detected once in the browser (the 3D view never renders on the server)
  quality: detectQuality(),
  setQuality: (quality) => set({ quality }),
  reducedMotion: false,
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),

  view: null,
  setView: (view) => set({ view }),

  command: null,
  send: (cmd) => set({ command: { ...cmd, id: ++commandId } as CameraCommand }),

  picking: false,
  setPicking: (picking) => set({ picking, pickedPoint: null, hoverPoint: null }),
  pickedPoint: null,
  setPickedPoint: (pickedPoint) => set({ pickedPoint }),
  hoverPoint: null,
  setHoverPoint: (hoverPoint) => set({ hoverPoint }),

  userLocation: null,
  setUserLocation: (userLocation) => set({ userLocation }),
}));
