"use client";

import { create } from "zustand";
import type { CityManifest } from "@geolausanne/geo-types";
import { MOTION_STORAGE_KEY } from "@/lib/theme";
import { artPixelRatio, detectQuality, HOME_VIEW, pixelSizeAt, QUALITY } from "@/lib/world/config";
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
  /** a retry is running; the error stays shown (and focused) until it ends */
  manifestRetrying: boolean;
  retryManifest(): void;
  /** WebGL unavailable or the renderer crashed */
  renderError: "no-webgl" | "crashed" | null;
  setRenderError(e: WorldState["renderError"]): void;

  stats: TileStoreStats;
  setStats(s: TileStoreStats): void;
  firstViewReady: boolean;
  setFirstViewReady(v: boolean): void;
  /** bumped to retry the blocks that failed to load right away */
  tilesAttempt: number;
  retryTiles(): void;

  night: boolean;
  setNight(v: boolean): void;
  quality: Quality;
  setQuality(q: Quality): void;
  /**
   * The canvas pixel ratio (R3F `dpr`): follows the zoom, set by the frame
   * pass (components/world/PixelArt.tsx) in the frame that uses it
   */
  canvasDpr: number;
  setCanvasDpr(r: number): void;
  /** the system setting (prefers-reduced-motion) */
  prefersReducedMotion: boolean;
  setPrefersReducedMotion(v: boolean): void;
  /** the visitor paused the map's animations (WCAG 2.2.2); remembered in this browser */
  motionPaused: boolean;
  setMotionPaused(v: boolean): void;
  /** either of the above: camera moves are instant, pins, trees and water hold still */
  reducedMotion: boolean;

  view: CameraView | null;
  setView(v: CameraView): void;
  /**
   * The surface point under the centre of the view, ray cast when called
   * (`view` is reported every 250 ms). Set while the 3D view is mounted.
   */
  surfaceAtCentre: (() => WorldPoint | null) | null;
  setSurfaceAtCentre(fn: (() => WorldPoint | null) | null): void;

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

  /** modal overlays currently hiding the map (see useCoverMap) */
  coveredBy: number;
  cover(delta: 1 | -1): void;

  // --- light and time of day (components/world/Atmosphere.tsx, lib/world/sun.ts) ---
  /**
   * Show the daylight of this instant (ms since 1970) instead of the clock's.
   * For screenshots and tests through the `?debug` handle; null = real time.
   */
  sunTime: number | null;
  setSunTime(t: number | null): void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

let commandId = 0;

function readMotionPaused(): boolean {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const initialMotionPaused = typeof window === "undefined" ? false : readMotionPaused();

const initialQuality = detectQuality();

/** The canvas resolution of the first view (home), so the first frame needs no resize. */
function initialCanvasDpr(quality: Quality): number {
  if (typeof window === "undefined") return 1;
  return artPixelRatio(pixelSizeAt(QUALITY[quality], window.innerWidth, HOME_VIEW.distance), window.devicePixelRatio || 1);
}

export const useWorldStore = create<WorldState>((set) => ({
  manifest: null,
  manifestError: null,
  setManifest: (manifest, error = null) => set({ manifest, manifestError: error, manifestRetrying: false }),
  manifestAttempt: 0,
  manifestRetrying: false,
  retryManifest: () => set((s) => ({ manifestRetrying: true, manifestAttempt: s.manifestAttempt + 1 })),
  renderError: null,
  setRenderError: (renderError) => set({ renderError }),

  stats: { cached: 0, drawn: 0, loading: 0, gpuBytes: 0, downloadedBytes: 0, failed: 0 },
  setStats: (stats) => set({ stats }),
  firstViewReady: false,
  setFirstViewReady: (firstViewReady) => set({ firstViewReady }),
  tilesAttempt: 0,
  retryTiles: () => set((s) => ({ tilesAttempt: s.tilesAttempt + 1 })),

  night: false,
  setNight: (night) => set({ night }),
  // detected once in the browser (the 3D view never renders on the server)
  quality: initialQuality,
  setQuality: (quality) => set({ quality }),
  canvasDpr: initialCanvasDpr(initialQuality),
  setCanvasDpr: (canvasDpr) => set({ canvasDpr }),
  prefersReducedMotion: false,
  setPrefersReducedMotion: (prefersReducedMotion) =>
    set((s) => ({ prefersReducedMotion, reducedMotion: prefersReducedMotion || s.motionPaused })),
  motionPaused: initialMotionPaused,
  setMotionPaused: (motionPaused) => {
    try {
      if (motionPaused) localStorage.setItem(MOTION_STORAGE_KEY, "1");
      else localStorage.removeItem(MOTION_STORAGE_KEY);
    } catch {
      // storage may be unavailable (private mode); the choice still holds for this visit
    }
    set((s) => ({ motionPaused, reducedMotion: s.prefersReducedMotion || motionPaused }));
  },
  reducedMotion: initialMotionPaused,

  view: null,
  setView: (view) => set({ view }),
  surfaceAtCentre: null,
  setSurfaceAtCentre: (surfaceAtCentre) => set({ surfaceAtCentre }),

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

  coveredBy: 0,
  cover: (delta) => set((s) => ({ coveredBy: Math.max(0, s.coveredBy + delta) })),

  // --- light and time of day ---
  sunTime: null,
  setSunTime: (sunTime) => set({ sunTime }),
}));
