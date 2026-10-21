"""Orchestrates the whole pipeline: sources -> voxels -> greedy meshes -> GLB.

Work is split into *blocks*, one per root (LOD 3, 1024 m) tile. For each block
the 1 m source rasters are assembled once (terrain, surface model, orthophoto,
OSM classification, trees, bridges); every tile of every LOD inside the block
is then voxelised from those rasters. Blocks run in parallel processes.
"""

from __future__ import annotations

import json
import math
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shapely
from rasterio.enums import Resampling
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import shape

from . import config, gwr, landcover, osm, roofs, vegetation
from .landcover import remove_small_regions
from . import materials as M
from .boundary import ensure_boundaries, municipalities_union, resolve_municipalities
from .buildings import Building, ensure_buildings, read_buildings
from .export import Instances, write_tile_glb
from .grid import TileKey, tiles_intersecting
from .imagery import ensure_swissimage
from .log import log
from .mesh import greedy_mesh
from .prefabs import PREFABS, choose_prefab, prefab_mesh, rotation_for
from .raster_io import RasterSource, fill_gaps, read_window
from .terrain import ensure_alti3d, ensure_surface3d
from .voxelize import (
    fill_canopy,
    fill_terrain,
    new_grid,
    stamp_column,
    stamp_slab,
    stamp_trees,
    voxelize_building,
)

BLOCK_MARGIN = 24.0  # metres of context around each root tile
#: context for the shore distance of lake water (deep beyond 160 m)
SHORE_CONTEXT = 192.0


@dataclass
class Sources:
    alti: list[RasterSource]
    surface: list[RasterSource]
    image: list[RasterSource]
    buildings: list[Path]
    osm: Path
    roof_image: list[RasterSource] = field(default_factory=list)
    gwr: Path | None = None
    editions: dict = field(default_factory=dict)


@dataclass
class Plan:
    roots: list[TileKey]
    tiles: dict[int, set[TileKey]]

    def in_root(self, root: TileKey) -> list[TileKey]:
        out = []
        for level, keys in self.tiles.items():
            out.extend(k for k in keys if k.ancestor(root.level) == root)
        return sorted(out, key=lambda k: (-k.level, k.j, k.i))


def plan_tiles(area: config.AreaSpec, detail_region: shapely.Geometry) -> Plan:
    """Top-down quadtree: a tile's four children exist iff the tile intersects
    the region of the child level (detail region for LOD 0/1, coarse bbox for
    LOD 2). This guarantees that every refined node has all four children."""
    root_level = config.ROOT_LEVEL
    roots = list(tiles_intersecting(root_level, area.coarse_bbox))
    tiles: dict[int, set[TileKey]] = {root_level: set(roots)}
    coarse = shapely.box(*area.coarse_bbox)
    for level in range(root_level, 0, -1):
        child_level = level - 1
        if child_level not in area.lods:
            break
        region = detail_region if child_level <= 1 else coarse
        nxt: set[TileKey] = set()
        for t in tiles.get(level, ()):
            if shapely.intersects(shapely.box(*t.bounds), region):
                nxt.update(t.children())
        if not nxt:
            break
        tiles[child_level] = nxt
    return Plan(roots=sorted(roots, key=lambda k: (k.j, k.i)), tiles=tiles)


# ---------------------------------------------------------------------------
# Block preparation
# ---------------------------------------------------------------------------


@dataclass
class BridgeDeck:
    geom: shapely.Geometry
    line: shapely.Geometry
    material: int
    distances: np.ndarray
    heights: np.ndarray
    ground: np.ndarray


@dataclass
class Block:
    bounds: tuple[float, float, float, float]
    dtm: np.ndarray
    cls: np.ndarray
    buildings: list[Building]
    bld_bbox: np.ndarray  # (nb, 4) west, south, east, north
    bld_colors: np.ndarray  # (nb, 4, 4) uint8: roof top, wall side, roof riser side, underside
    trees: np.ndarray  # (n, 6)
    tree_dense: np.ndarray  # (n,) bool: tree stands in a continuous canopy
    veg: np.ndarray  # (rows, cols) bool vegetation mask
    canopy: np.ndarray  # (rows, cols) float32 canopy height above ground
    leaf: np.ndarray  # (rows, cols) uint8 OSM leaf type
    bridges: list[BridgeDeck]
    #: colour statistics of the block (roof families, facade palettes, register matches)
    colour_stats: dict = field(default_factory=dict)


def _cell_lookup(arr: np.ndarray, bounds, e: np.ndarray, n: np.ndarray) -> np.ndarray:
    w, _s, _e, nn = bounds
    c = np.clip(((e - w)).astype(int), 0, arr.shape[-1] - 1)
    r = np.clip(((nn - n)).astype(int), 0, arr.shape[-2] - 1)
    return arr[..., r, c]


def _bridge_decks(lc: landcover.Landcover, bounds, dtm, dsm, cls) -> list[BridgeDeck]:
    decks: list[BridgeDeck] = []
    w, s, e, n = bounds
    transform = from_origin(w, n, 1.0, 1.0)
    for br in lc.bridges:
        line = br.centerline
        if line.length < 4:
            continue
        dist = np.arange(0.0, line.length + 0.5, 1.0)
        pts = shapely.line_interpolate_point(line, dist)
        xs, ys = shapely.get_x(pts), shapely.get_y(pts)
        inside = (xs > w) & (xs < e) & (ys > s) & (ys < n)
        if inside.sum() < 3:
            continue
        surf = _cell_lookup(dsm, bounds, xs, ys)
        ground = _cell_lookup(dtm, bounds, xs, ys)
        surf = np.where(np.isnan(surf), ground, surf)
        deck = ndimage.median_filter(surf, size=7, mode="nearest")
        clearance = deck - ground
        if np.nanmedian(clearance[inside]) < 2.0:
            # at-grade "bridge" (small culvert): paint it on the terrain
            rasterize([(br.geom, br.material)], out=cls, transform=transform)
            continue
        # decks never dip below the terrain they span
        deck = np.maximum(deck, ground + 0.5)
        decks.append(BridgeDeck(br.geom, line, br.material, dist, deck, ground))
    return decks


def _lake_mask(dtm: np.ndarray, res: float) -> np.ndarray:
    """Lake Geneva in a terrain raster: large flat regions at lake level.

    Regional OSM extracts cannot assemble the lake multipolygon (it spans
    France and Geneva), but swissALTI3D stores the lake as a flat surface at
    ~372.13 m (ADR 0007)."""
    lake = ndimage.binary_opening(dtm <= config.LAKE_LEVEL + 0.55, iterations=max(1, int(round(2 / res))))
    if not lake.any():
        return lake
    lab, _n = ndimage.label(lake)
    keep = np.bincount(lab.ravel()) * res * res >= 5000
    keep[0] = False
    return keep[lab]


def _shore_distance(src: Sources, bounds: tuple[float, float, float, float], shape: tuple[int, int]) -> np.ndarray:
    """Distance (m) of every cell of the block to the nearest land, measured
    on a 4 m terrain raster with ``SHORE_CONTEXT`` of margin so that
    neighbouring blocks agree."""
    res = 4.0
    c = SHORE_CONTEXT
    big = (bounds[0] - c, bounds[1] - c, bounds[2] + c, bounds[3] + c)
    dtm = fill_gaps(read_window(src.alti, big, res, resampling=Resampling.average), config.LAKE_LEVEL)
    lake = _lake_mask(dtm, res)
    dist = ndimage.distance_transform_edt(lake) * res
    rows, cols = shape
    rr = ((np.arange(rows) + 0.5) + c) / res
    cc = ((np.arange(cols) + 0.5) + c) / res
    return dist[np.clip(rr.astype(int), 0, dist.shape[0] - 1)][:, np.clip(cc.astype(int), 0, dist.shape[1] - 1)]


_OSM_BUILDING_KEYS = ("building:colour", "building:material", "building:facade:material", "roof:colour", "roof:material")


def _osm_building_tags(polys: list[osm.Feature], labels: np.ndarray, bounds) -> dict[int, dict[str, str]]:
    """OSM colour and material tags of the buildings, joined by footprint."""
    out: dict[int, dict[str, str]] = {}
    w, _s, _e, n = bounds
    rows, cols = labels.shape
    for f in polys:
        if not f.get("building") or not any(f.get(k) for k in _OSM_BUILDING_KEYS):
            continue
        p = f.geom.representative_point()
        r, c = int(n - p.y), int(p.x - w)
        if 0 <= r < rows and 0 <= c < cols and labels[r, c]:
            out.setdefault(int(labels[r, c]) - 1, {}).update({k: f.get(k) for k in _OSM_BUILDING_KEYS if f.get(k)})
    return out


def _roof_hint(objektart: str, osm_tags: dict[str, str], sample: M.RoofSample | None) -> str | None:
    """Families that the photo alone gets wrong or cannot see."""
    if objektart == "Treibhaus" or osm_tags.get("roof:material") == "glass":
        return "glass"
    if sample is not None:
        return None
    material = osm_tags.get("roof:material", "")
    if material in ("roof_tiles", "tile", "tiles"):
        return "terracotta"
    if material in ("grass", "plants"):
        return "green"
    if material == "copper":
        return "copper"
    rgb = M.parse_colour(osm_tags.get("roof:colour"))
    if rgb is not None:
        L, a, b = M.srgb_to_lab(np.array(rgb, dtype=float)[None, :])[0]
        return M.roof_family(M.RoofSample(float(L), float(a), float(b), 64), 0.5)
    return None


def colour_window(
    bounds: tuple[float, float, float, float], bbox: np.ndarray, step: float = 2.0
) -> tuple[float, float, float, float]:
    """``bounds`` grown to hold every building box, snapped outwards to a
    ``step`` grid anchored at the world origin (2 m: whole 1 m cells and
    whole 0.4 m orthophoto pixels)."""
    w, s, e, n = bounds
    if len(bbox):
        w, s = min(w, float(bbox[:, 0].min())), min(s, float(bbox[:, 1].min()))
        e, n = max(e, float(bbox[:, 2].max())), max(n, float(bbox[:, 3].max()))
    oe, on = config.ORIGIN_E, config.ORIGIN_N
    return (
        oe + math.floor((w - oe) / step) * step,
        on + math.floor((s - on) / step) * step,
        oe + math.ceil((e - oe) / step) * step,
        on + math.ceil((n - on) / step) * step,
    )


def prepare_block(root: TileKey, src: Sources) -> Block:
    w, s, e, n = root.bounds
    m = BLOCK_MARGIN
    bounds = (w - m, s - m, e + m, n + m)
    dtm = read_window(src.alti, bounds, 1.0, resampling=Resampling.bilinear)
    dtm = fill_gaps(dtm, config.LAKE_LEVEL)
    # mild smoothing: kills sub-metre bumps that would quantise into speckle
    dtm = ndimage.gaussian_filter(dtm, sigma=1.0, mode="nearest").astype(np.float32)
    dsm = read_window(src.surface, bounds, 1.0, resampling=Resampling.bilinear)
    dsm = np.where(np.isnan(dsm), dtm, dsm)
    ortho = read_window(src.image, bounds, 1.0, bands=[1, 2, 3], resampling=Resampling.bilinear)
    pts = osm.read_features(src.osm, "points", bounds)
    lines = osm.read_features(src.osm, "lines", bounds)
    polys = osm.read_features(src.osm, "multipolygons", bounds)
    lc = landcover.classify(bounds, 1.0, ortho, pts, lines, polys)
    cls = lc.cls
    cls[_lake_mask(dtm, 1.0)] = M.WATER

    blds = read_buildings(src.buildings, bounds)
    rows, cols = dtm.shape
    bbox = np.zeros((len(blds), 4))
    for bi, b in enumerate(blds):
        t = b.triangles
        bbox[bi] = (t[:, :, 0].min(), t[:, :, 1].min(), t[:, :, 0].max(), t[:, :, 1].max())
    # The colour inputs cover every building of the block whole, on a grid
    # anchored to the world origin: a building crossing the block's edge gets
    # the same roof sample and register match in every block it appears in.
    ext = colour_window(bounds, bbox)
    ext_rows, ext_cols = int(round(ext[3] - ext[1])), int(round(ext[2] - ext[0]))
    labels = np.zeros((ext_rows, ext_cols), dtype=np.int32)  # building index + 1 per 1 m cell
    pitched = np.zeros(len(blds))
    roof_tris: list[np.ndarray] = []
    roof_top = np.zeros(len(blds))
    for bi, b in enumerate(blds):
        t = b.triangles
        cell = np.empty(t.shape[:2] + (2,))
        cell[..., 0] = t[..., 0] - ext[0]
        cell[..., 1] = ext[3] - t[..., 1]
        roofs.rasterize_labels(cell, labels, bi + 1)
        # swissBUILDINGS3D solids are not consistently wound: orient each one
        # outwards with the sign of its volume before reading normals
        rel = t - t.reshape(-1, 3).mean(axis=0)
        nrm = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        if np.einsum("ij,ij->i", rel[:, 0], np.cross(rel[:, 1], rel[:, 2])).sum() < 0:
            nrm = -nrm
        area2 = np.linalg.norm(nrm, axis=1)
        nz = nrm[:, 2] / (area2 + 1e-9)
        up = nz > 0.35
        if up.any():
            pitched[bi] = float(area2[up & (nz < 0.94)].sum() / max(area2[up].sum(), 1e-9))
        roof_tris.append(t[up][:, :, :2])
        roof_top[bi] = float(t[:, :, 2].max())

    # roof colours from the 10 cm orthophoto (0.4 m), facades from the register
    samples: list[M.RoofSample | None] = [None] * len(blds)
    if src.roof_image and blds:
        res = config.ROOF_IMAGE_RESOLUTION
        rgb = roofs.read_rgb(src.roof_image, ext, res)
        samples = roofs.roof_samples(rgb, ext, res, roof_tris, roof_top)
    register = gwr.join_buildings(gwr.load_gwr(src.gwr, ext), labels, ext) if (src.gwr and blds) else {}
    tags = _osm_building_tags(polys, labels, ext)
    colors = np.zeros((len(blds), 4, 4), dtype=np.uint8)
    roof_counts: dict[str, int] = {}
    facade_counts: dict[str, int] = {}
    sampled = matched = 0
    for bi, b in enumerate(blds):
        t_osm = tags.get(bi, {})
        hint = _roof_hint(b.objektart, t_osm, samples[bi])
        fam, roof_rgb, roof_var = M.classify_roof(samples[bi], pitched[bi], b.uuid, hint)
        pal, wall_rgb, windows = M.facade_style(b.uuid, b.objektart, register.get(bi), fam, t_osm)
        colors[bi] = M.building_rows(roof_rgb, roof_var, wall_rgb, windows)
        # statistics over the buildings this block owns (centre inside the root)
        cx, cy = (bbox[bi, 0] + bbox[bi, 2]) / 2, (bbox[bi, 1] + bbox[bi, 3]) / 2
        if w <= cx < e and s <= cy < n:
            roof_counts[fam] = roof_counts.get(fam, 0) + 1
            facade_counts[pal] = facade_counts.get(pal, 0) + 1
            sampled += samples[bi] is not None
            matched += bi in register
    stats = {
        "buildings": sum(roof_counts.values()),
        "roofFamilies": roof_counts,
        "facadePalettes": facade_counts,
        "photoSampled": sampled,
        "registerMatched": matched,
    }

    r0, c0 = int(round(ext[3] - bounds[3])), int(round(bounds[0] - ext[0]))
    bmask = (labels[r0 : r0 + rows, c0 : c0 + cols] > 0) | lc.osm_buildings
    trees, veg, canopy = vegetation.detect_trees(bounds, 1.0, dtm, dsm, ortho, cls, lc.leaf, bmask)
    dense1 = ndimage.uniform_filter(veg.astype(np.float32), size=7) > 0.6
    if len(trees):
        tr_rows = np.clip((bounds[3] - trees[:, 1]).astype(int), 0, dense1.shape[0] - 1)
        tr_cols = np.clip((trees[:, 0] - bounds[0]).astype(int), 0, dense1.shape[1] - 1)
        tree_dense = dense1[tr_rows, tr_cols]
    else:
        tree_dense = np.zeros(0, dtype=bool)
    bridges = _bridge_decks(lc, bounds, dtm, dsm, cls)
    if (cls == M.WATER).any():
        cls = landcover.water_depth_classes(cls, _shore_distance(src, bounds, cls.shape))
    return Block(bounds, dtm, cls, blds, bbox, colors, trees, tree_dense, veg, canopy, lc.leaf, bridges, stats)


# ---------------------------------------------------------------------------
# Tiles
# ---------------------------------------------------------------------------


def _block_mode(cls: np.ndarray, f: int) -> np.ndarray:
    if f == 1:
        return cls.copy()
    h, w = cls.shape[0] // f, cls.shape[1] // f
    blocks = cls[: h * f, : w * f].reshape(h, f, w, f)
    best = np.zeros((h, w), dtype=np.uint8)
    best_count = np.full((h, w), -1.0)
    weight = {
        M.ROAD: 1.6, M.ROAD_MAJOR: 1.8, M.RAIL: 1.4, M.WATER: 1.3, M.WATER_SHALLOW: 1.3, M.WATER_DEEP: 1.3,
        M.PLAZA: 1.2, M.POOL: 1.6,
    }
    for c in np.unique(cls):
        cnt = (blocks == c).sum(axis=(1, 3)) * weight.get(int(c), 1.0)
        better = cnt > best_count
        best[better] = c
        best_count[better] = cnt[better]
    return best


def _local_tris(t: np.ndarray, west: float, north: float, v: float) -> np.ndarray:
    out = np.empty_like(t)
    out[:, :, 0] = (t[:, :, 0] - west) / v
    out[:, :, 1] = (t[:, :, 2] - config.ORIGIN_H) / v
    out[:, :, 2] = (north - t[:, :, 1]) / v
    return out


#: forests are not one flat green: patches of lighter and darker crowns, this
#: big (metres), anchored to the world so that every level agrees
CANOPY_PATCH = 12.0


def canopy_values(west: float, north: float, v: float, nv: int, needle: np.ndarray, mixed: np.ndarray) -> np.ndarray:
    """Leaf value per column (rows = south, cols = east) of a forest canopy:
    broadleaf patches in two greens, conifers darker and bluer, mixed forests
    a mosaic of both."""
    xs = west + (np.arange(nv) + 0.5) * v
    ys = north - (np.arange(nv) + 0.5) * v
    E, N = np.meshgrid(np.floor(xs / CANOPY_PATCH), np.floor(ys / CANOPY_PATCH))
    h = vegetation._hash01(E, N, 3.1)
    h2 = vegetation._hash01(E, N, 7.7)
    conifer = needle | (mixed & (h2 < 0.45))
    broad = np.where(h < 0.35, M.LEAVES_LIGHT, M.LEAVES)
    conif = np.where(h < 0.5, M.CONIFER_BLUE, M.LEAVES_DARK)
    return np.where(conifer, conif, broad).astype(np.uint16)


def tree_leaf_values(trees: np.ndarray) -> np.ndarray:
    """Crown value of each stamped tree: two shades per kind, from a hash of
    its position (stable across builds)."""
    h = vegetation._hash01(trees[:, 0], trees[:, 1], 5.3)
    broad = np.where(h < 0.3, M.LEAVES_LIGHT, M.LEAVES)
    conif = np.where(h < 0.45, M.CONIFER_BLUE, M.LEAVES_DARK)
    return np.where(trees[:, 5] >= 1, conif, broad).astype(np.float64)


def make_tile(tile: TileKey, blk: Block, out_dir: Path) -> dict:
    v = tile.voxel_size
    f = int(round(v))
    nv = config.TILE_VOXELS
    w, s, e, n = tile.bounds
    c0 = int(round(w - blk.bounds[0]))
    r0 = int(round(blk.bounds[3] - n))
    size = int(round(tile.tile_size))
    dtm = blk.dtm[r0 : r0 + size, c0 : c0 + size]
    cls = blk.cls[r0 : r0 + size, c0 : c0 + size]
    h_mean = dtm.reshape(nv, f, nv, f).mean(axis=(1, 3)) if f > 1 else dtm.copy()
    classes = _block_mode(cls, f)
    lake = np.isin(classes, (M.WATER, M.WATER_SHALLOW, M.WATER_DEEP)) & (np.abs(h_mean - config.LAKE_LEVEL) < 1.5)
    h_mean[lake] = config.LAKE_LEVEL
    levels = np.floor((h_mean - config.ORIGIN_H) / v + 0.5).astype(np.int32)
    # quantisation leaves single-voxel islands along x.5 m contours: merge them
    levels = remove_small_regions(levels, 8)

    # buildings overlapping the tile
    sel = np.nonzero(
        (blk.bld_bbox[:, 0] < e) & (blk.bld_bbox[:, 2] > w) & (blk.bld_bbox[:, 1] < n) & (blk.bld_bbox[:, 3] > s)
    )[0]
    top_level = int(levels.max())
    if len(sel):
        hmax = max(float(blk.buildings[i].triangles[:, :, 2].max()) for i in sel)
        top_level = max(top_level, int(math.ceil((hmax - config.ORIGIN_H) / v)) + 1)

    # trees
    tr = blk.trees
    instanced = tile.level in config.INSTANCED_TREE_LODS
    canopy_top = None
    if len(tr):
        pad = 0.0 if instanced else 8.0
        tmask = (tr[:, 0] >= w - pad) & (tr[:, 0] < e + pad) & (tr[:, 1] > s - pad) & (tr[:, 1] <= n + pad)
        if not instanced:
            # forests become one continuous canopy volume on coarse LODs;
            # only isolated trees are stamped individually
            tmask &= ~blk.tree_dense
        tr = tr[tmask]
    if not instanced:
        veg = blk.veg[r0 : r0 + size, c0 : c0 + size]
        can = blk.canopy[r0 : r0 + size, c0 : c0 + size]
        frac = veg.reshape(nv, f, nv, f).mean(axis=(1, 3))
        hsum = can.reshape(nv, f, nv, f).sum(axis=(1, 3))
        cnt = veg.reshape(nv, f, nv, f).sum(axis=(1, 3))
        dense = (frac >= 0.5) & ~np.isin(classes, M.WATER_CLASSES)
        if dense.any():
            hmean = np.where(cnt > 0, hsum / np.maximum(cnt, 1), 0.0)
            hmean = ndimage.gaussian_filter(np.where(dense, hmean, 0.0), sigma=0.8)
            canopy_top = levels + np.maximum(np.floor(hmean / v + 0.5).astype(np.int32), 1)
            canopy_top[~dense] = levels[~dense]
            top_level = max(top_level, int(canopy_top.max()) + 1)
    if len(tr):
        top_level = max(top_level, int(math.ceil(((tr[:, 2] + tr[:, 3]).max() - config.ORIGIN_H) / v)) + 1)
    for d in blk.bridges:
        top_level = max(top_level, int(math.ceil((d.heights.max() - config.ORIGIN_H) / v)) + 1)

    skirt = max(2, int(math.ceil(config.SKIRT_METRES / v)))
    grid, k_min = new_grid(levels, top_level, skirt)
    fill_terrain(grid, k_min, levels, classes)

    # two table entries per building: facade voxels and roof-step voxels
    bcolors = np.zeros((2 * len(sel), 3, 4), dtype=np.uint8)
    top_out = np.full((nv, nv), -32768, dtype=np.int32)
    for li, bi in enumerate(sel):
        roof_top, wall_side, riser_side, underside = blk.bld_colors[bi]
        bcolors[2 * li] = (roof_top, wall_side, underside)
        bcolors[2 * li + 1] = (roof_top, riser_side, underside)
        local = _local_tris(blk.buildings[bi].triangles, w, n, v)
        voxelize_building(grid, k_min, local, M.BUILDING_BASE + 2 * li, top_out, M.BUILDING_BASE + 2 * li + 1)

    # bridges: decks + pillars
    if blk.bridges:
        transform = from_origin(w, n, v, v)
        for d in blk.bridges:
            if not d.geom.intersects(shapely.box(w, s, e, n)):
                continue
            mask = rasterize([(d.geom, 1)], out_shape=(nv, nv), transform=transform, all_touched=False).astype(bool)
            if not mask.any():
                continue
            rr, cc = np.nonzero(mask)
            pts = shapely.points(w + (cc + 0.5) * v, n - (rr + 0.5) * v)
            along = shapely.line_locate_point(d.line, pts)
            hgt = np.interp(along, d.distances, d.heights)
            deck_levels = np.zeros((nv, nv), dtype=np.int32)
            deck_levels[rr, cc] = np.floor((hgt - config.ORIGIN_H) / v + 0.5).astype(np.int32)
            stamp_slab(grid, k_min, mask, deck_levels, 1, M.BRIDGE)
            # pillars every ~28 m where the deck is high above the valley
            for dist in np.arange(14.0, d.line.length - 10.0, 28.0):
                p = d.line.interpolate(dist)
                if not (w <= p.x < e and s < p.y <= n):
                    continue
                deck_h = float(np.interp(dist, d.distances, d.heights))
                gi = int((p.x - w) / v)
                gk = int((n - p.y) / v)
                g_level = int(levels[min(gk, nv - 1), min(gi, nv - 1)])
                d_level = int(math.floor((deck_h - config.ORIGIN_H) / v + 0.5)) - 1
                if (d_level - g_level) * v < 4.0:
                    continue
                size_v = max(1, int(round(2.0 / v)))
                stamp_column(grid, k_min, gi, gk, size_v, g_level, d_level, M.PILLAR)

    if canopy_top is not None:
        leaf = blk.leaf[r0 : r0 + size, c0 : c0 + size]
        needle = (leaf == landcover.LEAF_NEEDLE).reshape(nv, f, nv, f).mean(axis=(1, 3)) > 0.5
        mixed = (leaf == landcover.LEAF_MIXED).reshape(nv, f, nv, f).mean(axis=(1, 3)) > 0.5
        values = canopy_values(w, n, v, nv, needle, mixed)
        fill_canopy(grid, k_min, levels, canopy_top, values)

    instances: list[Instances] = []
    n_instances = 0
    tree_top = -1e9
    if len(tr):
        if instanced:
            groups: dict[int, list[int]] = {}
            for ti in range(len(tr)):
                pi = choose_prefab(tr[ti, 3], tr[ti, 4], tr[ti, 5] >= 1)
                groups.setdefault(pi, []).append(ti)
            for pi, idxs in sorted(groups.items()):
                rows = tr[idxs]
                lx = np.round(rows[:, 0] - w)
                lz = np.round(n - rows[:, 1])
                gx = np.clip(lx.astype(int), 0, nv - 1)
                gz = np.clip(lz.astype(int), 0, nv - 1)
                ly = levels[gz, gx].astype(np.float64)
                trans = np.stack([lx, ly, lz], 1).astype(np.float32)
                rots = np.array([rotation_for(r[0], r[1]) for r in rows], dtype=np.float32)
                instances.append(Instances(prefab_mesh(pi), trans, rots, PREFABS[pi].name))
                n_instances += len(rows)
                tree_top = max(tree_top, float((ly * v + PREFABS[pi].height).max()))
        else:
            local = np.empty((len(tr), 6))
            local[:, 0] = (tr[:, 0] - w) / v
            local[:, 1] = (n - tr[:, 1]) / v
            local[:, 2] = (tr[:, 2] - config.ORIGIN_H) / v
            local[:, 3:] = tr[:, 3:]
            local = np.concatenate([local, tree_leaf_values(tr)[:, None]], axis=1)
            stamp_trees(grid, k_min, local, v, np.array([M.LEAVES, M.LEAVES_DARK], dtype=np.uint16))

    roof_steps = M.BUILDING_BASE + 2 * np.arange(len(sel)) + 1
    opaque, water = greedy_mesh(grid, k_min, bcolors, ao=tile.level in config.AO_LEVELS, roof_steps=roof_steps)
    ys = [m.positions[:, 1] for m in (opaque, water) if not m.is_empty()]
    min_y = float(min(int(a.min()) for a in ys) * v) if ys else 0.0
    max_y = float(max(int(a.max()) for a in ys) * v) if ys else 0.0
    if tree_top > -1e9:
        max_y = max(max_y, tree_top)
    entry = {
        "level": tile.level,
        "i": tile.i,
        "j": tile.j,
        "minY": round(min_y, 2),
        "maxY": round(max_y, 2),
        "quads": opaque.quad_count + water.quad_count,
        "instances": n_instances,
    }
    if opaque.is_empty() and water.is_empty():
        entry["empty"] = True
        entry["bytes"] = 0
        return entry
    nbytes = write_tile_glb(
        out_dir / tile.path,
        tile.world_translation,
        v,
        opaque,
        water,
        instances,
        {"level": tile.level, "i": tile.i, "j": tile.j, "voxelSize": v},
    )
    entry["bytes"] = nbytes
    return entry


def process_root(root: TileKey, tiles: list[TileKey], src: Sources, out_dir: str) -> tuple[list[dict], dict]:
    t0 = time.monotonic()
    blk = prepare_block(root, src)
    t1 = time.monotonic()
    entries = [make_tile(t, blk, Path(out_dir)) for t in tiles]
    log(
        f"root {root.i},{root.j}: {len(tiles)} tiles, {len(blk.buildings)} buildings, "
        f"{len(blk.trees)} trees, {len(blk.bridges)} bridges "
        f"(prepare {t1 - t0:.1f}s, tiles {time.monotonic() - t1:.1f}s)"
    )
    return entries, blk.colour_stats


def merge_colour_stats(parts: list[dict]) -> dict:
    """Sum the per-block colour statistics (counts and count dictionaries)."""
    out: dict = {}
    for part in parts:
        for k, v in part.items():
            if isinstance(v, dict):
                d = out.setdefault(k, {})
                for kk, vv in v.items():
                    d[kk] = d.get(kk, 0) + vv
            else:
                out[k] = out.get(k, 0) + v
    for k, v in out.items():
        if isinstance(v, dict):
            out[k] = dict(sorted(v.items(), key=lambda kv: -kv[1]))
    return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def open_lake(alti: list[RasterSource], bbox: tuple[float, float, float, float], res: float = 16.0) -> shapely.Geometry | None:
    """Open water of Lake Geneva as polygons, from the terrain model.

    Same rule as in ``prepare_block`` (swissALTI3D stores the lake as a flat
    surface at ~372.13 m; regional OSM extracts cannot assemble the lake
    multipolygon), on a coarse grid: only bodies of at least 1 km² count, so
    ponds and harbours keep their detail.
    """
    dtm = fill_gaps(read_window(alti, bbox, res, resampling=Resampling.average), config.LAKE_LEVEL)
    lake = ndimage.binary_opening(dtm <= config.LAKE_LEVEL + 0.55, iterations=2)
    lab, _n = ndimage.label(lake)
    keep = np.bincount(lab.ravel()) * res * res >= 1e6
    keep[0] = False
    mask = keep[lab]
    if not mask.any():
        return None
    transform = from_origin(bbox[0], bbox[3], res, res)
    polys = [shape(geom) for geom, value in shapes(mask.astype(np.uint8), mask=mask, transform=transform) if value == 1]
    return shapely.union_all(polys)


def _open_water(osm_gpkg: Path, alti: list[RasterSource], bbox: tuple[float, float, float, float]) -> shapely.Geometry | None:
    """Lakes inside ``bbox``: OSM lakes plus the open lake from the terrain model."""
    water = [
        f.geom
        for f in osm.read_features(osm_gpkg, "multipolygons", bbox)
        if f.get("natural") == "water" and (f.get("water") == "lake" or f.geom.area > 5e6)
    ]
    lake = open_lake(alti, bbox)
    if lake is not None:
        water.append(lake)
    return shapely.union_all(water) if water else None


def detail_region_for(
    area: config.AreaSpec, cache: Path, osm_gpkg: Path, alti: list[RasterSource]
) -> tuple[shapely.Geometry, dict]:
    """The region that gets levels 0-1: the area's municipalities on land,
    buffered by ``municipality_buffer``, inside the detail box."""
    box = shapely.box(*area.detail_bbox)
    if not area.clip_to_municipalities:
        return box, {}
    gpkg, edition = ensure_boundaries(cache)
    munis = resolve_municipalities(gpkg, area.municipalities, area.canton)
    log("municipalities: " + ", ".join(f"{m.name} ({m.bfs})" for m in munis))
    muni = municipalities_union(gpkg, [m.bfs for m in munis])
    # remove open water: detailed tiles only make sense on land. The
    # municipality polygons include shares of Lake Geneva, which only the
    # terrain model provides; other large water bodies come from OSM.
    water = _open_water(osm_gpkg, alti, area.detail_bbox)
    # clip first: the lake share south of the box would otherwise come back as
    # a 250 m strip of open water along its edge once buffered
    land = muni.intersection(box)
    if water is not None:
        land = land.difference(water)
    region = land.buffer(area.municipality_buffer).intersection(box)
    # land the detail box leaves out would silently stay coarse: check it on
    # the (larger) context ring, where the terrain model is available too
    ring_water = _open_water(osm_gpkg, alti, area.coarse_bbox)
    ring_land = muni.intersection(shapely.box(*area.coarse_bbox))
    if ring_water is not None:
        ring_land = ring_land.difference(ring_water)
    outside = ring_land.difference(box).area / 1e6
    if outside > 0.01:
        log(f"WARNING: {outside:.2f} km² of the area's land lies outside its detail box (see `geovox area-plan`)")
    return region, {
        "swissBOUNDARIES3D": edition,
        "municipalities": [{"name": m.name, "bfs": m.bfs} for m in munis],
        "municipalityArea_km2": round(muni.area / 1e6, 2),
        "landArea_km2": round(land.area / 1e6, 2),
        "landOutsideDetail_km2": round(outside, 3),
    }


def suggest_bboxes(
    land: shapely.Geometry, buffer: float = 250.0, snap: float = 128.0, margin: float = 1024.0
) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    """Detail and context boxes for an area whose land is ``land``.

    Detail: the land buffered by ``buffer``, snapped outwards to the
    ``snap`` grid anchored at the world origin (128 m = one level-0 tile).
    Context: the detail box grown by ``margin`` on every side.
    """
    w, s, e, n = land.buffer(buffer).bounds

    def down(x: float, o: float) -> float:
        return o + math.floor((x - o) / snap) * snap

    def up(x: float, o: float) -> float:
        return o + math.ceil((x - o) / snap) * snap

    detail = (down(w, config.ORIGIN_E), down(s, config.ORIGIN_N), up(e, config.ORIGIN_E), up(n, config.ORIGIN_N))
    coarse = (detail[0] - margin, detail[1] - margin, detail[2] + margin, detail[3] + margin)
    return detail, coarse


def file_estimate(plan: Plan) -> int:
    """Upper bound of the files a build deploys: every tile (empty ones have
    none), the manifest, the horizon and the CDN `_headers`."""
    return sum(len(k) for k in plan.tiles.values()) + 3


def area_plan(area_name: str, cache: Path) -> dict:
    """Municipalities, land, suggested boxes and the tile plan of an area,
    without building it (downloads only the boundaries, OSM and the terrain)."""
    area = config.AREAS[area_name]
    roots = list(tiles_intersecting(config.ROOT_LEVEL, area.coarse_bbox))
    work_bbox = (
        min(t.bounds[0] for t in roots) - BLOCK_MARGIN,
        min(t.bounds[1] for t in roots) - BLOCK_MARGIN,
        max(t.bounds[2] for t in roots) + BLOCK_MARGIN,
        max(t.bounds[3] for t in roots) + BLOCK_MARGIN,
    )
    osm_gpkg, _ts = osm.ensure_osm(work_bbox, cache)
    alti, _ed = ensure_alti3d(work_bbox, cache)
    region, meta = detail_region_for(area, cache, osm_gpkg, alti)
    plan = plan_tiles(area, region)
    out: dict = {
        "area": area.name,
        **meta,
        "detail_bbox": list(area.detail_bbox),
        "coarse_bbox": list(area.coarse_bbox),
        "tiles": {str(lvl): len(k) for lvl, k in sorted(plan.tiles.items())},
        "files_max": file_estimate(plan),
        "file_budget": config.FILE_BUDGET,
    }
    if area.clip_to_municipalities:
        gpkg, _e = ensure_boundaries(cache)
        munis = resolve_municipalities(gpkg, area.municipalities, area.canton)
        muni = municipalities_union(gpkg, [m.bfs for m in munis])
        water = _open_water(osm_gpkg, alti, area.coarse_bbox)
        land = muni.intersection(shapely.box(*area.coarse_bbox))
        if water is not None:
            land = land.difference(water)
        detail, coarse = suggest_bboxes(land, area.municipality_buffer)
        out["suggested"] = {"detail_bbox": list(detail), "coarse_bbox": list(coarse)}
    return out


def build(area_name: str, out_dir: Path, cache: Path, workers: int, only_root: tuple[int, int] | None = None) -> dict:
    area = config.AREAS[area_name]
    cache.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    roots_bbox = area.coarse_bbox
    plan_roots = list(tiles_intersecting(config.ROOT_LEVEL, roots_bbox))
    rw = min(t.bounds[0] for t in plan_roots) - BLOCK_MARGIN
    rs = min(t.bounds[1] for t in plan_roots) - BLOCK_MARGIN
    re_ = max(t.bounds[2] for t in plan_roots) + BLOCK_MARGIN
    rn = max(t.bounds[3] for t in plan_roots) + BLOCK_MARGIN
    work_bbox = (rw, rs, re_, rn)
    log(f"area {area.name}: work bbox {work_bbox}")

    osm_gpkg, osm_ts = osm.ensure_osm(work_bbox, cache)
    alti, alti_ed = ensure_alti3d(work_bbox, cache)
    surface, surf_ed = ensure_surface3d(work_bbox, cache)
    image, img_ed = ensure_swissimage(work_bbox, cache)
    roof_image, roof_ed = roofs.ensure_roof_imagery(work_bbox, cache)
    bldg, bldg_items = ensure_buildings(work_bbox, cache)
    gwr_path, gwr_ed = gwr.ensure_gwr(cache)
    region, region_meta = detail_region_for(area, cache, osm_gpkg, alti)
    src = Sources(alti, surface, image, bldg, osm_gpkg, roof_image, gwr_path)

    plan = plan_tiles(area, region)
    counts = {lvl: len(k) for lvl, k in sorted(plan.tiles.items())}
    files = file_estimate(plan)
    log(f"plan: {counts}, at most {files} files")
    if files > config.FILE_BUDGET:
        log(f"WARNING: {files} files exceed the hosting budget of {config.FILE_BUDGET} (docs/pipeline/README.md#file-budget)")

    # warm up numba caches in the parent so workers load compiled code
    for i in range(len(PREFABS)):
        prefab_mesh(i)

    roots = plan.roots
    if only_root is not None:
        roots = [r for r in roots if (r.i, r.j) == only_root]
    entries: list[dict] = []
    colour_parts: list[dict] = []
    if workers <= 1:
        for r in roots:
            tiles_done, colours = process_root(r, plan.in_root(r), src, str(out_dir))
            entries.extend(tiles_done)
            colour_parts.append(colours)
    else:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(process_root, r, plan.in_root(r), src, str(out_dir)): r for r in roots}
            for fut in as_completed(futs):
                tiles_done, colours = fut.result()
                entries.extend(tiles_done)
                colour_parts.append(colours)
    colours = merge_colour_stats(colour_parts)
    log(f"colours: {colours}")

    from .manifest import write_manifest

    editions = {
        "swissALTI3D": alti_ed,
        "swissSURFACE3D": surf_ed,
        "SWISSIMAGE": img_ed,
        "SWISSIMAGE 10 cm (roofs)": roof_ed,
        "swissBUILDINGS3D": bldg_items,
        "GWR": gwr_ed,
        "OpenStreetMap": osm_ts,
        **region_meta,
    }
    manifest = write_manifest(out_dir, area, entries, editions, colours=colours)
    return manifest


def default_workers() -> int:
    return max(1, min(4, (os.cpu_count() or 2)))


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


__all__ = ["build", "plan_tiles", "make_tile", "prepare_block", "json"]
