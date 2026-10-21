/** Runtime configuration of the 3D world. */
import type { Quality } from "@/stores/world-store";

/**
 * Where the tiles live. Defaults to the copy served by Next.js from
 * `public/city/<area>`; production points at a CDN (Cloudflare Pages).
 */
export const CITY_BASE_URL = (process.env.NEXT_PUBLIC_CITY_BASE_URL || "/city/flon").replace(/\/$/, "");

export interface QualityPreset {
  maxVoxelPx: number;
  dpr: [number, number];
  budgetMB: number;
  maxConcurrent: number;
  antialias: boolean;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { maxVoxelPx: 4, dpr: [0.75, 1], budgetMB: 120, maxConcurrent: 4, antialias: false },
  medium: { maxVoxelPx: 2.8, dpr: [1, 1.5], budgetMB: 220, maxConcurrent: 6, antialias: true },
  high: { maxVoxelPx: 2.0, dpr: [1, 2], budgetMB: 400, maxConcurrent: 8, antialias: true },
};

/** Guess a sensible default quality for this device. */
export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  if (mem <= 3 || cores <= 4) return "low";
  if (coarse || mem <= 6) return "medium";
  return "high";
}

/**
 * World origin shared by every build of the city (see docs/architecture/
 * coordinates.md): world x = E - 2 538 000, y = H - 372, z = 1 152 000 - N.
 * The manifest repeats it; this copy lets the UI convert coordinates before
 * the manifest has loaded.
 */
export const WORLD_ORIGIN = { easting: 2538000, northing: 1152000, elevation: 372 };

/** Initial camera: above the lake shore looking north over Flon to the cathedral. */
export const HOME_VIEW = { x: -60, y: 110, z: -520, distance: 1450, azimuth: 0.35, polar: 1.02 };
