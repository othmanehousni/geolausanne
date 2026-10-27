"use client";

/**
 * Camera helpers shared by the overlay UI (search, spots list, deep links):
 * convert LV95 positions to world space and ask the camera rig to fly there.
 */
import type { Place } from "@/lib/data/types";
import { useWorldStore } from "@/stores/world-store";
import { WORLD_ORIGIN } from "./config";
import { finestTileAt, tileIndexFor } from "./lod";
import { loadedSurfaceAt } from "./picking";

function origin() {
  return useWorldStore.getState().manifest?.origin ?? WORLD_ORIGIN;
}

export function lv95ToWorldXZ(easting: number, northing: number): { x: number; z: number } {
  const o = origin();
  return { x: easting - o.easting, z: o.northing - northing };
}

export function worldToLv95(x: number, y: number, z: number): { easting: number; northing: number; elevation: number } {
  const o = origin();
  return { easting: o.easting + x, northing: o.northing - z, elevation: o.elevation + y };
}

export function elevationToWorldY(elevation: number): number {
  return elevation - origin().elevation;
}

/** True when an LV95 point lies inside the streamed city (or when the city is not loaded yet). */
export function insideCity(easting: number, northing: number): boolean {
  const m = useWorldStore.getState().manifest;
  if (!m) return true;
  const [w, s, e, n] = m.bounds.lv95;
  return easting >= w && easting <= e && northing >= s && northing <= n;
}

/**
 * Best guess of the surface height (world y) at (x, z) before the place is
 * drawn: the finest tile loaded there, else the vertical extent of the
 * finest tile in the manifest (the ground lies about 40 % of the way up,
 * under roofs and trees). Null outside the city or before the manifest.
 * The camera rig settles on the drawn surface once it streams in.
 */
export function groundHeightAt(x: number, z: number): number | null {
  const loaded = loadedSurfaceAt(x, z);
  if (loaded) return loaded.y;
  const manifest = useWorldStore.getState().manifest;
  const tile = manifest ? finestTileAt(tileIndexFor(manifest), x, z) : null;
  return tile ? tile.minY + (tile.maxY - tile.minY) * 0.4 : null;
}

/** A flight waiting for the city's manifest (see flyToLv95); the latest request wins. */
let pendingFlight: (() => void) | null = null;

export interface FlyOptions {
  /** metres above sea level, when known */
  elevation?: number | null;
  /** camera distance from the point, metres */
  distance?: number;
  /**
   * Called instead of flying when the point lies outside the loaded city.
   * The camera is kept over the city, so such a flight stopped at its edge
   * with nothing said (EPFL from the Flon demo city).
   */
  onOutside?: () => void;
}

/** Fly the camera to an LV95 position, if it lies in the loaded city (see `FlyOptions.onOutside`). */
export function flyToLv95(easting: number, northing: number, opts: FlyOptions = {}) {
  pendingFlight?.();
  pendingFlight = null;
  // A shared link (?spot=) resolves before the city's manifest has loaded.
  // Without the manifest nothing is known of the ground there, and the last
  // fallback (40 m above the lake) put a hilltop spot underground: the camera
  // ended below the terrain with no tile in view, so the ground probe never
  // found the surface to correct it. Such a flight waits for the manifest,
  // and so does one whose caller wants to hear about points outside the city.
  const knownHeight = opts.elevation !== undefined && opts.elevation !== null;
  if (!useWorldStore.getState().manifest && (!knownHeight || opts.onOutside)) {
    const unsubscribe = useWorldStore.subscribe((s) => {
      if (!s.manifest) return;
      unsubscribe();
      pendingFlight = null;
      flyToLv95(easting, northing, opts);
    });
    pendingFlight = unsubscribe;
    return;
  }
  if (!insideCity(easting, northing)) {
    opts.onOutside?.();
    return;
  }
  const { x, z } = lv95ToWorldXZ(easting, northing);
  const state = useWorldStore.getState();
  const o = origin();
  const y =
    opts.elevation !== undefined && opts.elevation !== null
      ? opts.elevation - o.elevation
      : (groundHeightAt(x, z) ?? state.view?.targetY ?? 40);
  state.send({ kind: "flyTo", target: { x, y, z, distance: opts.distance ?? 320 } });
}

export function flyToPlace(place: Pick<Place, "easting" | "northing" | "elevation">, opts: Omit<FlyOptions, "elevation"> = {}) {
  flyToLv95(place.easting, place.northing, { distance: 240, ...opts, elevation: place.elevation });
}
