/**
 * Voxel-city manifest written by the geovox pipeline (manifest.py).
 * Bump FORMAT_VERSION in both places on breaking changes.
 */
import { tileKey, type LodSpec, type TileId, type WorldOrigin } from "./grid";

export const MANIFEST_FORMAT = "geolausanne-voxel-city";
export const MANIFEST_FORMAT_VERSION = 1;

/** [level, i, j, minY, maxY, bytes] - bytes == 0 means "empty tile, no file". */
export type TileRow = [number, number, number, number, number, number];

export interface ManifestSource {
  id: string;
  name: string;
  provider: string;
  license: string;
  url: string;
}

export interface CityManifest {
  format: typeof MANIFEST_FORMAT;
  formatVersion: number;
  city: string;
  area: string;
  version: string;
  generatedAt: string;
  crs: "EPSG:2056";
  heightReference: string;
  origin: WorldOrigin;
  axes: { x: "east"; y: "up"; z: "south" };
  tileVoxels: number;
  rootLevel: number;
  lods: LodSpec[];
  lakeLevel: number;
  bounds: { lv95: [number, number, number, number]; wgs84: [number, number, number, number] };
  tileFields: string[];
  tiles: TileRow[];
  horizon: { path: string; bytes: number } | null;
  stats: Record<string, { tiles: number; empty: number; bytes: number; quads: number; instances: number }>;
  editions: Record<string, unknown>;
  sources: ManifestSource[];
  attribution: string;
}

export interface TileInfo extends TileId {
  minY: number;
  maxY: number;
  bytes: number;
  empty: boolean;
  /** true when all four children exist in the manifest */
  refinable: boolean;
}

export interface TileIndex {
  manifest: CityManifest;
  byKey: Map<string, TileInfo>;
  roots: TileInfo[];
  lod(level: number): LodSpec;
}

export function parseManifest(json: unknown): CityManifest {
  const m = json as Partial<CityManifest>;
  if (!m || m.format !== MANIFEST_FORMAT) throw new Error("not a geolausanne voxel-city manifest");
  if (m.formatVersion !== MANIFEST_FORMAT_VERSION) {
    throw new Error(`unsupported manifest version ${String(m.formatVersion)} (expected ${MANIFEST_FORMAT_VERSION})`);
  }
  if (!Array.isArray(m.tiles) || !Array.isArray(m.lods) || !m.origin) throw new Error("manifest is missing tiles/lods/origin");
  return m as CityManifest;
}

export function indexManifest(manifest: CityManifest): TileIndex {
  const byKey = new Map<string, TileInfo>();
  for (const [level, i, j, minY, maxY, bytes] of manifest.tiles) {
    byKey.set(tileKey({ level, i, j }), { level, i, j, minY, maxY, bytes, empty: bytes === 0, refinable: false });
  }
  for (const t of byKey.values()) {
    if (t.level === 0) continue;
    const l = t.level - 1;
    t.refinable = [
      [2 * t.i, 2 * t.j],
      [2 * t.i + 1, 2 * t.j],
      [2 * t.i, 2 * t.j + 1],
      [2 * t.i + 1, 2 * t.j + 1],
    ].every(([ci, cj]) => byKey.has(`${l}/${ci}/${cj}`));
  }
  const roots = [...byKey.values()].filter((t) => t.level === manifest.rootLevel);
  const lods = new Map(manifest.lods.map((l) => [l.level, l]));
  return {
    manifest,
    byKey,
    roots,
    lod(level: number) {
      const spec = lods.get(level);
      if (!spec) throw new Error(`unknown LOD ${level}`);
      return spec;
    },
  };
}
