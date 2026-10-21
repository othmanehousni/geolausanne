/** Runtime configuration of the 3D world. */
import type { Quality } from "@/stores/world-store";

/**
 * Where the tiles live. Defaults to the copy served by Next.js from
 * `public/city/<area>`; production points at a CDN (Cloudflare Pages).
 */
export const CITY_BASE_URL = (process.env.NEXT_PUBLIC_CITY_BASE_URL || "/city/flon").replace(/\/$/, "");

export interface QualityPreset {
  /** refine a tile once one of its voxels covers more CSS pixels than this */
  maxVoxelPx: number;
  /** canvas pixel ratio for R3F (`[min, max]`, equal here): see {@link artPixelRatio} */
  readonly dpr: [number, number];
  budgetMB: number;
  maxConcurrent: number;
  /** MSAA: off everywhere, it would smear the pixel art */
  antialias: boolean;
  /** size of one rendered pixel in CSS pixels, on wide and on narrow screens */
  pixelSize: { wide: number; narrow: number };
  /** dark outlines on silhouettes (an extra low-resolution pass) */
  outlines: boolean;
}

/** Below this CSS width the screen counts as narrow (phones). */
export const NARROW_SCREEN = 640;

/**
 * Canvas pixel ratio for a pixel-art look: the city is rendered at a low
 * resolution and the browser scales it up with `image-rendering: pixelated`.
 * One rendered pixel covers a whole number of device pixels (`n`), so every
 * pixel has the same size on screen: about `pixelCss` CSS pixels.
 */
export function artPixelRatio(pixelCss: number, deviceRatio: number): number {
  const dpr = deviceRatio > 0 && Number.isFinite(deviceRatio) ? deviceRatio : 1;
  const n = Math.max(1, Math.round(pixelCss * dpr));
  return dpr / n;
}

/** The rendered pixel size (CSS px) of a preset on this screen. */
export function pixelSizeFor(preset: Pick<QualityPreset, "pixelSize">, cssWidth: number): number {
  return cssWidth < NARROW_SCREEN ? preset.pixelSize.narrow : preset.pixelSize.wide;
}

function preset(p: Omit<QualityPreset, "dpr">): QualityPreset {
  return {
    ...p,
    get dpr(): [number, number] {
      if (typeof window === "undefined") return [1, 1];
      const r = artPixelRatio(pixelSizeFor(p, window.innerWidth), window.devicePixelRatio || 1);
      return [r, r];
    },
  };
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: preset({ maxVoxelPx: 4, budgetMB: 120, maxConcurrent: 4, antialias: false, pixelSize: { wide: 3, narrow: 2 }, outlines: false }),
  medium: preset({ maxVoxelPx: 2.8, budgetMB: 220, maxConcurrent: 6, antialias: false, pixelSize: { wide: 2, narrow: 1.5 }, outlines: true }),
  high: preset({ maxVoxelPx: 2.0, budgetMB: 400, maxConcurrent: 8, antialias: false, pixelSize: { wide: 2, narrow: 1.5 }, outlines: true }),
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
 * World origin shared by every build of the city (see docs/pipeline/
 * coordinate-system.md): world x = E - 2 538 000, y = H - 372, z = 1 152 000 - N.
 * The manifest repeats it; this copy lets the UI convert coordinates before
 * the manifest has loaded.
 */
export const WORLD_ORIGIN = { easting: 2538000, northing: 1152000, elevation: 372 };

/** Initial camera: above the lake shore looking north over Flon to the cathedral. */
export const HOME_VIEW = { x: -60, y: 110, z: -520, distance: 1450, azimuth: 0.35, polar: 1.02 };
