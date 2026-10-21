"""Greedy meshing specialised for voxel heightfields (no overhangs).

Used for the horizon, where a dense 3D grid would be far too large: tops are
merged in 2D over equal (level, colour) regions and side walls are merged
along runs of equal (low, high, colour) between neighbouring columns.
"""

from __future__ import annotations

import numpy as np
from numba import njit

from .mesh import MeshData


@njit(cache=True)
def _tops(levels, keys, valid):
    rows, cols = levels.shape
    done = np.zeros((rows, cols), dtype=np.bool_)
    out = np.empty((rows * cols, 6), dtype=np.int32)  # z0, x0, z1, x1, level, key
    n = 0
    for r in range(rows):
        c = 0
        while c < cols:
            if done[r, c] or not valid[r, c]:
                c += 1
                continue
            lv = levels[r, c]
            k = keys[r, c]
            w = 1
            while c + w < cols and not done[r, c + w] and valid[r, c + w] and levels[r, c + w] == lv and keys[r, c + w] == k:
                w += 1
            h = 1
            while r + h < rows:
                ok = True
                for cc in range(c, c + w):
                    if done[r + h, cc] or not valid[r + h, cc] or levels[r + h, cc] != lv or keys[r + h, cc] != k:
                        ok = False
                        break
                if not ok:
                    break
                h += 1
            for rr in range(r, r + h):
                for cc in range(c, c + w):
                    done[rr, cc] = True
            out[n, 0] = r
            out[n, 1] = c
            out[n, 2] = r + h
            out[n, 3] = c + w
            out[n, 4] = lv
            out[n, 5] = k
            n += 1
            c += w
    return out[:n]


@njit(cache=True)
def _sides(levels, side_keys, valid, floor_level):
    """Vertical walls. Returns rows (axis, plane, run0, run1, lo, hi, key, sign)."""
    rows, cols = levels.shape
    out = np.empty((rows * cols * 2 + 16, 8), dtype=np.int32)
    n = 0
    # walls facing +x / -x between columns c and c+1 (plane x = c+1); edges at borders
    for c in range(-1, cols):
        r = 0
        while r < rows:
            a_ok = c >= 0 and valid[r, c]
            b_ok = c + 1 < cols and valid[r, c + 1]
            la = levels[r, c] if a_ok else floor_level
            lb = levels[r, c + 1] if b_ok else floor_level
            if la == lb:
                r += 1
                continue
            if la > lb:
                sign, lo, hi, k = 1, lb, la, side_keys[r, c]
            else:
                sign, lo, hi, k = -1, la, lb, side_keys[r, c + 1]
            run = 1
            while r + run < rows:
                a2 = c >= 0 and valid[r + run, c]
                b2 = c + 1 < cols and valid[r + run, c + 1]
                la2 = levels[r + run, c] if a2 else floor_level
                lb2 = levels[r + run, c + 1] if b2 else floor_level
                if la2 > lb2:
                    s2, lo2, hi2, k2 = 1, lb2, la2, side_keys[r + run, c]
                elif la2 < lb2:
                    s2, lo2, hi2, k2 = -1, la2, lb2, side_keys[r + run, c + 1]
                else:
                    break
                if s2 != sign or lo2 != lo or hi2 != hi or k2 != k:
                    break
                run += 1
            out[n, 0] = 0
            out[n, 1] = c + 1
            out[n, 2] = r
            out[n, 3] = r + run
            out[n, 4] = lo
            out[n, 5] = hi
            out[n, 6] = k
            out[n, 7] = sign
            n += 1
            if n >= out.shape[0]:
                return out[:n]
            r += run
    # walls facing +z (south, row r+1) / -z between rows r and r+1
    for r in range(-1, rows):
        c = 0
        while c < cols:
            a_ok = r >= 0 and valid[r, c]
            b_ok = r + 1 < rows and valid[r + 1, c]
            la = levels[r, c] if a_ok else floor_level
            lb = levels[r + 1, c] if b_ok else floor_level
            if la == lb:
                c += 1
                continue
            if la > lb:
                sign, lo, hi, k = 1, lb, la, side_keys[r, c]
            else:
                sign, lo, hi, k = -1, la, lb, side_keys[r + 1, c]
            run = 1
            while c + run < cols:
                a2 = r >= 0 and valid[r, c + run]
                b2 = r + 1 < rows and valid[r + 1, c + run]
                la2 = levels[r, c + run] if a2 else floor_level
                lb2 = levels[r + 1, c + run] if b2 else floor_level
                if la2 > lb2:
                    s2, lo2, hi2, k2 = 1, lb2, la2, side_keys[r, c + run]
                elif la2 < lb2:
                    s2, lo2, hi2, k2 = -1, la2, lb2, side_keys[r + 1, c + run]
                else:
                    break
                if s2 != sign or lo2 != lo or hi2 != hi or k2 != k:
                    break
                run += 1
            out[n, 0] = 2
            out[n, 1] = r + 1
            out[n, 2] = c
            out[n, 3] = c + run
            out[n, 4] = lo
            out[n, 5] = hi
            out[n, 6] = k
            out[n, 7] = sign
            n += 1
            if n >= out.shape[0]:
                return out[:n]
            c += run
    return out[:n]


def mesh_heightfield(
    levels: np.ndarray,
    top_rgba: np.ndarray,
    side_rgba: np.ndarray,
    valid: np.ndarray,
    origin_x: int,
    origin_z: int,
    floor_level: int,
) -> MeshData:
    """levels: (rows=z, cols=x) int32 surface levels. Colours are (rows, cols, 4)
    uint8. Vertex positions are offset by (origin_x, origin_z) voxel units."""
    palette: dict[tuple[int, ...], int] = {}

    def keys_for(rgba: np.ndarray) -> tuple[np.ndarray, list[tuple[int, ...]]]:
        flat = rgba.reshape(-1, 4)
        uniq, inv = np.unique(flat, axis=0, return_inverse=True)
        return inv.reshape(rgba.shape[:2]).astype(np.int32), [tuple(int(x) for x in u) for u in uniq]

    tk, tpal = keys_for(top_rgba)
    sk, spal = keys_for(side_rgba)
    tops = _tops(levels.astype(np.int32), tk, valid)
    sides = _sides(levels.astype(np.int32), sk, valid, np.int32(floor_level))
    nq = len(tops) + len(sides)
    pos = np.empty((nq, 4, 3), dtype=np.int32)
    col = np.empty((nq, 4), dtype=np.uint8)
    # tops: normal +y, corners (z,x) CCW seen from above with u = z, v = x
    if len(tops):
        z0, x0, z1, x1, lv, k = (tops[:, i] for i in range(6))
        corners = [(x0, z0), (x0, z1), (x1, z1), (x1, z0)]
        for ci, (cx, cz) in enumerate(corners):
            pos[: len(tops), ci, 0] = cx + origin_x
            pos[: len(tops), ci, 1] = lv
            pos[: len(tops), ci, 2] = cz + origin_z
        col[: len(tops)] = np.array(tpal, dtype=np.uint8)[k]
    if len(sides):
        o = len(tops)
        axis, plane, a0, a1, lo, hi, k, sign = (sides[:, i] for i in range(8))
        sp = np.array(spal, dtype=np.uint8)
        for q in range(len(sides)):
            if axis[q] == 0:  # x-normal wall at x = plane, spanning z in [a0, a1]
                x = plane[q] + origin_x
                za, zb = a0[q] + origin_z, a1[q] + origin_z
                if sign[q] > 0:
                    quad = [(x, lo[q], za), (x, hi[q], za), (x, hi[q], zb), (x, lo[q], zb)]
                else:
                    quad = [(x, lo[q], za), (x, lo[q], zb), (x, hi[q], zb), (x, hi[q], za)]
            else:  # z-normal wall at z = plane, spanning x in [a0, a1]
                z = plane[q] + origin_z
                xa, xb = a0[q] + origin_x, a1[q] + origin_x
                if sign[q] > 0:
                    quad = [(xa, lo[q], z), (xb, lo[q], z), (xb, hi[q], z), (xa, hi[q], z)]
                else:
                    quad = [(xa, lo[q], z), (xa, hi[q], z), (xb, hi[q], z), (xb, lo[q], z)]
            pos[o + q] = quad
        col[o:] = sp[k]
    positions = pos.reshape(-1, 3)
    if np.abs(positions).max(initial=0) > 32767:
        raise ValueError("heightfield too large for int16 positions")
    colors = np.repeat(col, 4, axis=0)
    base = (np.arange(nq, dtype=np.uint32) * 4)[:, None]
    idx = (base + np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32)[None, :]).reshape(-1)
    return MeshData(positions.astype(np.int16), colors, idx)
