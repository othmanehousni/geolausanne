/**
 * Quadtree level-of-detail selection for the voxel city.
 *
 * A tile is refined into its four children when one of its voxels would
 * cover more than `maxVoxelPx` pixels on screen (screen-space error). To
 * avoid popping when the camera hovers on a boundary, a tile that is already
 * refined only coarsens again below `maxVoxelPx * hysteresis`.
 *
 * Parents keep rendering until *all four* children are ready, then the
 * children replace them in one frame, so there are never holes. Children of
 * visible tiles are requested slightly before they are needed (prefetch).
 *
 * This module is pure (no three.js), which keeps it unit-testable.
 */
import { childrenOf, tileKey, tileWorldBox, type Box3Like, type TileIndex, type TileInfo } from "@geolausanne/geo-types";

export interface LodCamera {
  x: number;
  y: number;
  z: number;
  /** vertical field of view in radians */
  fov: number;
  /** drawing-buffer height in CSS pixels */
  viewportHeight: number;
}

export interface LodOptions {
  /** refine when a voxel spans more than this many pixels */
  maxVoxelPx: number;
  /** a refined node coarsens again below maxVoxelPx * hysteresis */
  hysteresis: number;
  /** request children once a node reaches maxVoxelPx * prefetch */
  prefetch: number;
}

export const DEFAULT_LOD_OPTIONS: LodOptions = { maxVoxelPx: 2.2, hysteresis: 0.72, prefetch: 0.7 };

const ROOT_PRIORITY = 1_000_000;

export interface LodRequest {
  key: string;
  tile: TileInfo;
  /** larger = more urgent */
  priority: number;
}

export interface LodResult {
  /** tiles to draw this frame (all ready) */
  render: TileInfo[];
  /** tiles that should be loading, most urgent first */
  requests: LodRequest[];
  /** keys of nodes that are refined this frame (feed back as `previouslyRefined`) */
  refined: Set<string>;
}

export function distanceToBox(cam: { x: number; y: number; z: number }, b: Box3Like): number {
  const dx = Math.max(b.minX - cam.x, 0, cam.x - b.maxX);
  const dy = Math.max(b.minY - cam.y, 0, cam.y - b.maxY);
  const dz = Math.max(b.minZ - cam.z, 0, cam.z - b.maxZ);
  return Math.hypot(dx, dy, dz);
}

/** Size in pixels of one voxel of ``voxelSize`` metres seen from ``distance``. */
export function projectedVoxelPx(voxelSize: number, distance: number, cam: LodCamera): number {
  const pxPerRadian = cam.viewportHeight / (2 * Math.tan(cam.fov / 2));
  return (voxelSize * pxPerRadian) / Math.max(distance, 1e-3);
}

export function selectTiles(
  index: TileIndex,
  cam: LodCamera,
  isVisible: (box: Box3Like) => boolean,
  isReady: (key: string) => boolean,
  previouslyRefined: ReadonlySet<string>,
  options: LodOptions = DEFAULT_LOD_OPTIONS,
): LodResult {
  const render: TileInfo[] = [];
  const requests = new Map<string, LodRequest>();
  const refined = new Set<string>();

  const want = (tile: TileInfo, priority: number) => {
    if (tile.empty) return;
    const key = tileKey(tile);
    if (isReady(key)) return;
    const prev = requests.get(key);
    if (!prev || prev.priority < priority) requests.set(key, { key, tile, priority });
  };

  const ready = (tile: TileInfo) => tile.empty || isReady(tileKey(tile));

  const visit = (tile: TileInfo) => {
    const lod = index.lod(tile.level);
    const box = tileWorldBox(tile, lod.tileSize, tile.minY, tile.maxY);
    if (!isVisible(box)) return;
    const key = tileKey(tile);
    const px = projectedVoxelPx(lod.voxelSize, distanceToBox(cam, box), cam);
    const threshold = previouslyRefined.has(key) ? options.maxVoxelPx * options.hysteresis : options.maxVoxelPx;

    if (tile.refinable) {
      const children = childrenOf(tile).map((c) => index.byKey.get(tileKey(c))!);
      if (px > threshold) {
        if (children.every(ready)) {
          refined.add(key);
          for (const c of children) visit(c);
          return;
        }
        // refine as soon as possible: children are urgent, nearest first
        for (const c of children) want(c, px);
      } else if (px > options.maxVoxelPx * options.prefetch) {
        for (const c of children) want(c, px * 0.25);
      }
    }

    if (tile.empty) return;
    if (isReady(key)) render.push(tile);
    // Only roots can get here unloaded (children are visited once all are ready):
    // nothing is drawn for them yet, so they outrank every refinement.
    else want(tile, ROOT_PRIORITY + px);
  };

  for (const root of index.roots) visit(root);

  return {
    render,
    requests: [...requests.values()].sort((a, b) => b.priority - a.priority),
    refined,
  };
}
