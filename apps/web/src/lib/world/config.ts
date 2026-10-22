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
  budgetMB: number;
  maxConcurrent: number;
  /** MSAA on the canvas: off, the frame is drawn into a render target first (see `smoothFar`) */
  antialias: boolean;
  /**
   * Size of one rendered pixel in CSS pixels: up close on wide and on narrow
   * screens, and `far` once the camera has pulled back (see {@link pixelSizeAt})
   */
  pixelSize: { wide: number; narrow: number; far: number };
  /** at the far pixel size, antialias the frame (4× MSAA in the render target) */
  smoothFar: boolean;
  /** dark outlines on silhouettes (an extra low-resolution pass) */
  outlines: boolean;
}

/** Below this CSS width the screen counts as narrow (phones). */
export const NARROW_SCREEN = 640;

/**
 * Orbit distances (metres) over which rendered pixels shrink from their
 * close-up size to their far size. Up close large pixels are the voxel
 * look; from afar they turned a whole district into noise.
 */
export const PIXEL_ZOOM = { near: 1200, far: 3200 };

/** How far past the halfway point to another whole number the wanted size must go before it changes. */
const PIXEL_HYSTERESIS = 0.25;

function saneRatio(deviceRatio: number): number {
  return deviceRatio > 0 && Number.isFinite(deviceRatio) ? deviceRatio : 1;
}

/**
 * Device pixels per rendered pixel for a wanted size of `pixelCss` CSS
 * pixels: a whole number, so every rendered pixel has the same size on
 * screen. A change resizes the canvas and shows, so the `current` value is
 * kept until the wanted size is clearly closer to another one: the
 * resolution does not flicker when the zoom rests near a boundary.
 */
export function devicePixelsFor(pixelCss: number, deviceRatio: number, current?: number): number {
  const v = pixelCss * saneRatio(deviceRatio);
  const wanted = Math.max(1, Math.round(v));
  if (current === undefined || !(current >= 1) || current === wanted) return wanted;
  return Math.abs(v - current) > 0.5 + PIXEL_HYSTERESIS ? wanted : current;
}

/**
 * Canvas pixel ratio for a pixel-art look: the city is rendered at a low
 * resolution and the browser scales it up with `image-rendering: pixelated`.
 * One rendered pixel covers a whole number of device pixels (`n`), so every
 * pixel has the same size on screen: about `pixelCss` CSS pixels.
 */
export function artPixelRatio(pixelCss: number, deviceRatio: number): number {
  const dpr = saneRatio(deviceRatio);
  return dpr / devicePixelsFor(pixelCss, dpr);
}

/** The close-up rendered pixel size (CSS px) of a preset on this screen. */
export function pixelSizeFor(preset: Pick<QualityPreset, "pixelSize">, cssWidth: number): number {
  return cssWidth < NARROW_SCREEN ? preset.pixelSize.narrow : preset.pixelSize.wide;
}

/** The rendered pixel size (CSS px) wanted with the camera `distance` metres from the point it orbits. */
export function pixelSizeAt(preset: Pick<QualityPreset, "pixelSize">, cssWidth: number, distance: number): number {
  const close = pixelSizeFor(preset, cssWidth);
  const far = Math.min(close, preset.pixelSize.far);
  const x = Math.min(1, Math.max(0, (distance - PIXEL_ZOOM.near) / (PIXEL_ZOOM.far - PIXEL_ZOOM.near)));
  return close + (far - close) * x * x * (3 - 2 * x);
}

/** Whether `devicePixels` is the preset's far size on this screen, drawn smooth (MSAA). */
export function isSmoothLevel(preset: Pick<QualityPreset, "pixelSize" | "smoothFar">, devicePixels: number, deviceRatio: number): boolean {
  return preset.smoothFar && devicePixels <= devicePixelsFor(preset.pixelSize.far, deviceRatio);
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { maxVoxelPx: 4, budgetMB: 120, maxConcurrent: 4, antialias: false, pixelSize: { wide: 3, narrow: 2, far: 1.5 }, smoothFar: false, outlines: false },
  medium: { maxVoxelPx: 2.8, budgetMB: 220, maxConcurrent: 6, antialias: false, pixelSize: { wide: 2, narrow: 1.5, far: 1 }, smoothFar: true, outlines: true },
  high: { maxVoxelPx: 2.0, budgetMB: 400, maxConcurrent: 8, antialias: false, pixelSize: { wide: 2, narrow: 1.5, far: 1 }, smoothFar: true, outlines: true },
};

/**
 * Linear fog range, metres from the camera. Its start moves out with the
 * zoom (1.5× the distance to the point the camera orbits, never closer than
 * 2.2 km): at a fixed 2.2 km the whole city sat in the haze once the camera
 * pulled back to 9 km.
 */
export function fogRange(orbitDistance: number): [number, number] {
  const near = Math.max(2200, orbitDistance * 1.5);
  return [near, near + 14_800];
}

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
