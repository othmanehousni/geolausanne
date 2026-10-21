"""Build the dense voxel grid of one tile.

Grid layout: ``grid[x, y, z]`` (uint16) with ``x`` = east, ``y`` = up and
``z`` = south, ``0 <= x, z < 128``. Voxel ``y`` sits at absolute level
``k = y + k_min`` (it spans ``[H0 + k v, H0 + (k + 1) v)``).

Buildings are voxelised with a vertical-ray parity test against their closed
triangle surfaces (swissBUILDINGS3D ``Building_solid``), which keeps pitched
roofs, towers, overhangs and passages. Non-watertight solids fall back to
filling between their lowest and highest hit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numba import njit

from . import materials as M

# Sub-voxel jitter of the sampling rays avoids double hits on shared edges.
_JX = 1.2345e-4
_JZ = 2.3456e-4
_MAX_HITS = 64


@njit(cache=True)
def _rasterize_hits(tris, x0, z0, w, h, hits, counts):
    """Intersect vertical rays through column centres with triangles.

    tris: (n, 3, 3) local coordinates (x, y, z) in voxel units.
    Columns are indexed relative to (x0, z0) within a (w, h) window.
    """
    for t in range(tris.shape[0]):
        ax, ay, az = tris[t, 0, 0], tris[t, 0, 1], tris[t, 0, 2]
        bx, by, bz = tris[t, 1, 0], tris[t, 1, 1], tris[t, 1, 2]
        cx, cy, cz = tris[t, 2, 0], tris[t, 2, 1], tris[t, 2, 2]
        area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
        if abs(area) < 1e-12:
            continue
        minx = min(ax, min(bx, cx))
        maxx = max(ax, max(bx, cx))
        minz = min(az, min(bz, cz))
        maxz = max(az, max(bz, cz))
        i0 = max(int(math.ceil(minx - 0.5 - _JX)), x0)
        i1 = min(int(math.floor(maxx - 0.5 - _JX)), x0 + w - 1)
        k0 = max(int(math.ceil(minz - 0.5 - _JZ)), z0)
        k1 = min(int(math.floor(maxz - 0.5 - _JZ)), z0 + h - 1)
        for ci in range(i0, i1 + 1):
            px = ci + 0.5 + _JX
            for ck in range(k0, k1 + 1):
                pz = ck + 0.5 + _JZ
                w0 = (bx - px) * (cz - pz) - (cx - px) * (bz - pz)
                w1 = (cx - px) * (az - pz) - (ax - px) * (cz - pz)
                w2 = (ax - px) * (bz - pz) - (bx - px) * (az - pz)
                if area > 0:
                    if w0 < 0 or w1 < 0 or w2 < 0:
                        continue
                else:
                    if w0 > 0 or w1 > 0 or w2 > 0:
                        continue
                y = (w0 * ay + w1 * by + w2 * cy) / area
                li = ci - x0
                lk = ck - z0
                n = counts[li, lk]
                if n < _MAX_HITS:
                    hits[li, lk, n] = y
                    counts[li, lk] = n + 1


@njit(cache=True)
def _fill_building(grid, k_min, x0, z0, w, h, hits, counts, value, top_out):
    """Fill voxels between paired hits and update ``top_out[z, x]`` (highest
    filled level per column, -32768 when empty)."""
    nx, ny, nz = grid.shape
    for li in range(w):
        gx = x0 + li
        if gx < 0 or gx >= nx:
            continue
        for lk in range(h):
            gz = z0 + lk
            if gz < 0 or gz >= nz:
                continue
            n = counts[li, lk]
            if n == 0:
                continue
            col = np.sort(hits[li, lk, :n])
            if n % 2 == 1:
                spans = 1
                a_lo = col[0]
                a_hi = col[n - 1]
            else:
                spans = n // 2
                a_lo = 0.0
                a_hi = 0.0
            for s in range(spans):
                if n % 2 == 0:
                    lo = col[2 * s]
                    hi = col[2 * s + 1]
                else:
                    lo = a_lo
                    hi = a_hi
                k_lo = int(math.ceil(lo - 0.5))
                k_hi = int(math.floor(hi - 0.5))
                if k_hi < k_lo:
                    # thin slabs (canopies, thin roofs) still get one voxel
                    if hi - lo > 0.25:
                        k_lo = int(math.floor((lo + hi) * 0.5))
                        k_hi = k_lo
                    else:
                        continue
                for k in range(k_lo, k_hi + 1):
                    y = k - k_min
                    if 0 <= y < ny:
                        grid[gx, y, gz] = value
                        if k > top_out[gz, gx]:
                            top_out[gz, gx] = k


def voxelize_building(grid: np.ndarray, k_min: int, tris_local: np.ndarray, value: int, top_out: np.ndarray) -> None:
    """Rasterise one building (triangles in local voxel units) into ``grid``."""
    if len(tris_local) == 0:
        return
    xs = tris_local[:, :, 0]
    zs = tris_local[:, :, 2]
    x0 = max(int(math.floor(xs.min())) - 1, 0)
    x1 = min(int(math.ceil(xs.max())) + 1, grid.shape[0])
    z0 = max(int(math.floor(zs.min())) - 1, 0)
    z1 = min(int(math.ceil(zs.max())) + 1, grid.shape[2])
    if x1 <= x0 or z1 <= z0:
        return
    w, h = x1 - x0, z1 - z0
    hits = np.empty((w, h, _MAX_HITS), dtype=np.float64)
    counts = np.zeros((w, h), dtype=np.int32)
    _rasterize_hits(np.ascontiguousarray(tris_local, dtype=np.float64), x0, z0, w, h, hits, counts)
    _fill_building(grid, k_min, x0, z0, w, h, hits, counts, value, top_out)


@njit(cache=True)
def fill_terrain(grid, k_min, levels, classes):
    """Columns: SOIL from the grid floor up to ``levels - 2``, class voxel on top."""
    nx, ny, nz = grid.shape
    for x in range(nx):
        for z in range(nz):
            top = levels[z, x] - k_min  # number of filled voxels in the grid
            if top > ny:
                top = ny
            for y in range(0, top - 1):
                if grid[x, y, z] == 0:
                    grid[x, y, z] = 1  # SOIL
            if top >= 1 and grid[x, top - 1, z] == 0:
                grid[x, top - 1, z] = classes[z, x]


@njit(cache=True)
def stamp_slab(grid, k_min, mask, deck_levels, thickness, value):
    """Bridge decks: ``thickness`` voxels ending at ``deck_levels`` where mask."""
    nx, ny, nz = grid.shape
    for x in range(nx):
        for z in range(nz):
            if not mask[z, x]:
                continue
            top = deck_levels[z, x] - k_min
            for y in range(top - thickness, top):
                if 0 <= y < ny:
                    grid[x, y, z] = value


@njit(cache=True)
def stamp_column(grid, k_min, x0, z0, size, k_lo, k_hi, value):
    nx, ny, nz = grid.shape
    for x in range(x0, x0 + size):
        for z in range(z0, z0 + size):
            if 0 <= x < nx and 0 <= z < nz:
                for k in range(k_lo, k_hi):
                    y = k - k_min
                    if 0 <= y < ny and grid[x, y, z] == 0:
                        grid[x, y, z] = value


@njit(cache=True)
def stamp_trees(grid, k_min, trees, v, leaf_values):
    """Stamp trees as voxel ellipsoids + trunk (used for LOD >= 1).

    trees: (n, 6) float64 rows (x, z, ground_level, height_m, radius_m, kind)
    with x/z in local voxel units and ground_level in voxel levels.
    """
    nx, ny, nz = grid.shape
    for t in range(trees.shape[0]):
        tx, tz, g, hgt, rad, kind = trees[t, 0], trees[t, 1], trees[t, 2], trees[t, 3], trees[t, 4], trees[t, 5]
        hv = hgt / v
        rv = max(rad / v, 0.5)
        conifer = kind >= 1.0
        crown_bottom = g + hv * (0.25 if conifer else 0.35)
        crown_top = g + hv
        cy = (crown_bottom + crown_top) * 0.5
        ry = max((crown_top - crown_bottom) * 0.5, 0.5)
        leaf = leaf_values[1] if conifer else leaf_values[0]
        xi0 = int(math.floor(tx - rv))
        xi1 = int(math.ceil(tx + rv))
        zi0 = int(math.floor(tz - rv))
        zi1 = int(math.ceil(tz + rv))
        yi0 = int(math.floor(crown_bottom))
        yi1 = int(math.ceil(crown_top))
        for x in range(xi0, xi1 + 1):
            if x < 0 or x >= nx:
                continue
            for z in range(zi0, zi1 + 1):
                if z < 0 or z >= nz:
                    continue
                dx = (x + 0.5 - tx) / rv
                dz = (z + 0.5 - tz) / rv
                for k in range(yi0, yi1):
                    y = k - k_min
                    if y < 0 or y >= ny or grid[x, y, z] != 0:
                        continue
                    dy = (k + 0.5 - cy) / ry
                    if conifer:
                        # cone: radius shrinks linearly towards the top
                        frac = (k + 0.5 - crown_bottom) / max(crown_top - crown_bottom, 1e-6)
                        rr = (1.0 - frac) * 1.05
                        if dx * dx + dz * dz <= rr * rr:
                            grid[x, y, z] = leaf
                    elif dx * dx + dy * dy + dz * dz <= 1.0:
                        grid[x, y, z] = leaf
        # trunk (only visible when the crown is high enough above ground)
        txi = int(math.floor(tx))
        tzi = int(math.floor(tz))
        if 0 <= txi < nx and 0 <= tzi < nz:
            for k in range(int(g), int(math.floor(crown_bottom)) + 1):
                y = k - k_min
                if 0 <= y < ny and grid[txi, y, tzi] == 0:
                    grid[txi, y, tzi] = 22  # TRUNK


@dataclass
class TileGrid:
    grid: np.ndarray  # (128, ny, 128) uint16
    k_min: int
    building_colors: list[tuple[tuple[int, int, int], tuple[int, int, int]]]  # (wall, roof) per building idx


def new_grid(levels: np.ndarray, top_level: int, skirt_voxels: int) -> tuple[np.ndarray, int]:
    k_min = int(levels.min()) - skirt_voxels
    ny = max(top_level - k_min + 2, 2)
    return np.zeros((levels.shape[1], ny, levels.shape[0]), dtype=np.uint16), k_min


assert M.SOIL == 1 and M.TRUNK == 22


@njit(cache=True)
def rasterize_footprint(tris, mask):
    """Mark cells of ``mask`` (rows = z, cols = x) whose centre lies inside the
    XZ projection of any triangle (local units)."""
    rows, cols = mask.shape
    for t in range(tris.shape[0]):
        ax, az = tris[t, 0, 0], tris[t, 0, 2]
        bx, bz = tris[t, 1, 0], tris[t, 1, 2]
        cx, cz = tris[t, 2, 0], tris[t, 2, 2]
        area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
        if abs(area) < 1e-12:
            continue
        i0 = max(int(math.ceil(min(ax, min(bx, cx)) - 0.5)), 0)
        i1 = min(int(math.floor(max(ax, max(bx, cx)) - 0.5)), cols - 1)
        k0 = max(int(math.ceil(min(az, min(bz, cz)) - 0.5)), 0)
        k1 = min(int(math.floor(max(az, max(bz, cz)) - 0.5)), rows - 1)
        for ci in range(i0, i1 + 1):
            px = ci + 0.5
            for ck in range(k0, k1 + 1):
                pz = ck + 0.5
                w0 = (bx - px) * (cz - pz) - (cx - px) * (bz - pz)
                w1 = (cx - px) * (az - pz) - (ax - px) * (cz - pz)
                w2 = (ax - px) * (bz - pz) - (bx - px) * (az - pz)
                if (w0 >= 0 and w1 >= 0 and w2 >= 0) or (w0 <= 0 and w1 <= 0 and w2 <= 0):
                    mask[ck, ci] = True
