/**
 * World coordinates and quadtree tile math, mirroring
 * pipelines/geodata/src/geovox/grid.py. Keep both files in sync.
 *
 * World (three.js) space: x = E - E0 (east), y = H - H0 (up), z = N0 - N (south).
 */

export interface WorldOrigin {
  easting: number;
  northing: number;
  elevation: number;
}

export interface LodSpec {
  level: number;
  voxelSize: number;
  tileSize: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export function lv95ToWorld(origin: WorldOrigin, e: number, n: number, h = origin.elevation): Vec3Like {
  return { x: e - origin.easting, y: h - origin.elevation, z: origin.northing - n };
}

export function worldToLv95(origin: WorldOrigin, x: number, y: number, z: number): { e: number; n: number; h: number } {
  return { e: x + origin.easting, n: origin.northing - z, h: y + origin.elevation };
}

export interface TileId {
  level: number;
  i: number;
  j: number;
}

export function tileKey(t: TileId): string {
  return `${t.level}/${t.i}/${t.j}`;
}

export function parseTileKey(key: string): TileId {
  const [level, i, j] = key.split("/").map(Number);
  if (level === undefined || i === undefined || j === undefined || [level, i, j].some(Number.isNaN)) {
    throw new Error(`invalid tile key ${key}`);
  }
  return { level, i, j };
}

export function tilePath(t: TileId): string {
  return `lod${t.level}/${t.i}_${t.j}.glb`;
}

export function childrenOf(t: TileId): TileId[] {
  if (t.level === 0) return [];
  const l = t.level - 1;
  return [
    { level: l, i: 2 * t.i, j: 2 * t.j },
    { level: l, i: 2 * t.i + 1, j: 2 * t.j },
    { level: l, i: 2 * t.i, j: 2 * t.j + 1 },
    { level: l, i: 2 * t.i + 1, j: 2 * t.j + 1 },
  ];
}

export function parentOf(t: TileId): TileId {
  return { level: t.level + 1, i: Math.floor(t.i / 2), j: Math.floor(t.j / 2) };
}

/** World-space axis-aligned box of a tile (x/z from the grid, y from the manifest). */
export interface Box3Like {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function tileWorldBox(t: TileId, tileSize: number, minY: number, maxY: number): Box3Like {
  return {
    minX: t.i * tileSize,
    maxX: (t.i + 1) * tileSize,
    minZ: -(t.j + 1) * tileSize,
    maxZ: -t.j * tileSize,
    minY,
    maxY,
  };
}

/** Tile of ``level`` that contains a world-space point. */
export function tileAtWorld(level: number, tileSize: number, x: number, z: number): TileId {
  return { level, i: Math.floor(x / tileSize), j: Math.floor(-z / tileSize) };
}
