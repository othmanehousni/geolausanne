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
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy import ndimage

from . import config, landcover, osm, vegetation
from .landcover import remove_small_regions
from . import materials as M
from .boundary import ensure_boundaries, municipality
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
    rasterize_footprint,
    stamp_column,
    stamp_slab,
    stamp_trees,
    voxelize_building,
)

BLOCK_MARGIN = 24.0  # metres of context around each root tile


@dataclass
class Sources:
    alti: list[RasterSource]
    surface: list[RasterSource]
    image: list[RasterSource]
    buildings: list[Path]
    osm: Path
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
    bld_colors: np.ndarray  # (nb, 3, 4) uint8
    trees: np.ndarray  # (n, 6)
    tree_dense: np.ndarray  # (n,) bool: tree stands in a continuous canopy
    veg: np.ndarray  # (rows, cols) bool vegetation mask
    canopy: np.ndarray  # (rows, cols) float32 canopy height above ground
    leaf: np.ndarray  # (rows, cols) uint8 OSM leaf type
    bridges: list[BridgeDeck]


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
    # Lake Geneva: regional OSM extracts cannot assemble the lake multipolygon
    # (it spans France and Geneva), but swissALTI3D stores the lake as a flat
    # surface at ~372.13 m. Large regions at lake level are the lake.
    lake = ndimage.binary_opening(dtm <= config.LAKE_LEVEL + 0.55, iterations=2)
    if lake.any():
        lab, _n = ndimage.label(lake)
        sizes = np.bincount(lab.ravel())
        keep = sizes >= 5000
        keep[0] = False
        cls[keep[lab]] = M.WATER

    blds = read_buildings(src.buildings, bounds)
    rows, cols = dtm.shape
    footprint = np.zeros((rows, cols), dtype=np.bool_)
    bbox = np.zeros((len(blds), 4))
    colors = np.zeros((len(blds), 3, 4), dtype=np.uint8)
    for bi, b in enumerate(blds):
        t = b.triangles
        bbox[bi] = (t[:, :, 0].min(), t[:, :, 1].min(), t[:, :, 0].max(), t[:, :, 1].max())
        local = np.empty_like(t)
        local[:, :, 0] = t[:, :, 0] - bounds[0]
        local[:, :, 1] = t[:, :, 2]
        local[:, :, 2] = bounds[3] - t[:, :, 1]
        rasterize_footprint(local, footprint)
        # roof colour: orthophoto median under the roof triangles, plus the
        # share of the roof area that is pitched (tiles vs flat roofs).
        # swissBUILDINGS3D solids are not consistently wound: orient each one
        # outwards with the sign of its volume before reading normals.
        rel = t - t.reshape(-1, 3).mean(axis=0)
        nrm = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        if np.einsum("ij,ij->i", rel[:, 0], np.cross(rel[:, 1], rel[:, 2])).sum() < 0:
            nrm = -nrm
        area2 = np.linalg.norm(nrm, axis=1)
        nz = nrm[:, 2] / (area2 + 1e-9)
        up = nz > 0.35
        rgb = None
        pitched = 0.0
        if up.any():
            cen = t[up].mean(axis=1)
            samples = _cell_lookup(ortho, bounds, cen[:, 0], cen[:, 1])  # (3, k)
            if samples.shape[-1] and not np.isnan(samples).all():
                rgb = tuple(float(x) for x in np.nanmedian(samples, axis=1))
            pitched = float(area2[up & (nz < 0.94)].sum() / max(area2[up].sum(), 1e-9))
        roof = M.snap_roof_color(rgb, b.uuid, pitched)
        wall = M.wall_color(b.uuid, b.objektart)
        colors[bi, 0] = (*roof, M.SHADER_ROOF)
        colors[bi, 1] = (*wall, M.SHADER_WALL)
        colors[bi, 2] = (*(int(c * 0.72) for c in wall), M.SHADER_WALL)

    bmask = footprint | lc.osm_buildings
    trees, veg, canopy = vegetation.detect_trees(bounds, 1.0, dtm, dsm, ortho, cls, lc.leaf, bmask)
    dense1 = ndimage.uniform_filter(veg.astype(np.float32), size=7) > 0.6
    if len(trees):
        tr_rows = np.clip((bounds[3] - trees[:, 1]).astype(int), 0, dense1.shape[0] - 1)
        tr_cols = np.clip((trees[:, 0] - bounds[0]).astype(int), 0, dense1.shape[1] - 1)
        tree_dense = dense1[tr_rows, tr_cols]
    else:
        tree_dense = np.zeros(0, dtype=bool)
    bridges = _bridge_decks(lc, bounds, dtm, dsm, cls)
    return Block(bounds, dtm, cls, blds, bbox, colors, trees, tree_dense, veg, canopy, lc.leaf, bridges)


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
    weight = {M.ROAD: 1.6, M.ROAD_MAJOR: 1.8, M.RAIL: 1.4, M.WATER: 1.3, M.PLAZA: 1.2}
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
    lake = (classes == M.WATER) & (np.abs(h_mean - config.LAKE_LEVEL) < 1.5)
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
        dense = (frac >= 0.5) & (classes != M.WATER)
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

    bcolors = np.zeros((len(sel), 3, 4), dtype=np.uint8)
    top_out = np.full((nv, nv), -32768, dtype=np.int32)
    for li, bi in enumerate(sel):
        bcolors[li] = blk.bld_colors[bi]
        local = _local_tris(blk.buildings[bi].triangles, w, n, v)
        voxelize_building(grid, k_min, local, M.BUILDING_BASE + li, top_out)

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
        values = np.where(needle, M.LEAVES_DARK, M.LEAVES).astype(np.uint16)
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
            stamp_trees(grid, k_min, local, v, np.array([M.LEAVES, M.LEAVES_DARK], dtype=np.uint16))

    opaque, water = greedy_mesh(grid, k_min, bcolors)
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


def process_root(root: TileKey, tiles: list[TileKey], src: Sources, out_dir: str) -> list[dict]:
    t0 = time.monotonic()
    blk = prepare_block(root, src)
    t1 = time.monotonic()
    entries = [make_tile(t, blk, Path(out_dir)) for t in tiles]
    log(
        f"root {root.i},{root.j}: {len(tiles)} tiles, {len(blk.buildings)} buildings, "
        f"{len(blk.trees)} trees, {len(blk.bridges)} bridges "
        f"(prepare {t1 - t0:.1f}s, tiles {time.monotonic() - t1:.1f}s)"
    )
    return entries


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def detail_region_for(area: config.AreaSpec, cache: Path, osm_gpkg: Path) -> tuple[shapely.Geometry, dict]:
    if not area.clip_to_municipality:
        return shapely.box(*area.detail_bbox), {}
    gpkg, edition = ensure_boundaries(cache)
    muni = municipality(gpkg, area.municipality_bfs)
    # remove the open lake: detailed tiles only make sense on land
    lakes = [
        f.geom
        for f in osm.read_features(osm_gpkg, "multipolygons", area.detail_bbox)
        if f.get("natural") == "water" and (f.get("water") == "lake" or f.geom.area > 5e6)
    ]
    land = muni.difference(shapely.union_all(lakes)) if lakes else muni
    region = land.buffer(area.municipality_buffer).intersection(shapely.box(*area.detail_bbox))
    return region, {"swissBOUNDARIES3D": edition, "municipalityArea_km2": round(muni.area / 1e6, 2)}


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
    bldg, bldg_items = ensure_buildings(work_bbox, cache)
    region, region_meta = detail_region_for(area, cache, osm_gpkg)
    src = Sources(alti, surface, image, bldg, osm_gpkg)

    plan = plan_tiles(area, region)
    counts = {lvl: len(k) for lvl, k in sorted(plan.tiles.items())}
    log(f"plan: {counts}")

    # warm up numba caches in the parent so workers load compiled code
    for i in range(len(PREFABS)):
        prefab_mesh(i)

    roots = plan.roots
    if only_root is not None:
        roots = [r for r in roots if (r.i, r.j) == only_root]
    entries: list[dict] = []
    if workers <= 1:
        for r in roots:
            entries.extend(process_root(r, plan.in_root(r), src, str(out_dir)))
    else:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(process_root, r, plan.in_root(r), src, str(out_dir)): r for r in roots}
            for fut in as_completed(futs):
                entries.extend(fut.result())

    from .manifest import write_manifest

    editions = {
        "swissALTI3D": alti_ed,
        "swissSURFACE3D": surf_ed,
        "SWISSIMAGE": img_ed,
        "swissBUILDINGS3D": bldg_items,
        "OpenStreetMap": osm_ts,
        **region_meta,
    }
    manifest = write_manifest(out_dir, area, entries, editions)
    return manifest


def default_workers() -> int:
    return max(1, min(4, (os.cpu_count() or 2)))


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


__all__ = ["build", "plan_tiles", "make_tile", "prepare_block", "json"]
