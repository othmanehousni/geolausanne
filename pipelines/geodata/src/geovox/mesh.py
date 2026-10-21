"""Greedy meshing of voxel grids.

Only faces between a solid voxel and air are emitted; coplanar neighbouring
faces with the same colour are merged into maximal rectangles (the classic
"greedy meshing" algorithm), so a facade made of hundreds of voxels becomes a
handful of quads while still looking blocky.

Faces on the tile's side boundaries are always emitted (they form the
crack-hiding skirts); faces on the grid floor never are.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numba import njit

from . import materials as M


@njit(cache=True)
def _greedy_direction(g, s, is_vertical_axis, face_keys, face_kind):
    """Greedy-merge all faces of one orientation.

    g: grid transposed so that axis 0 is the face normal axis, axes 1/2 are
    (u, v). Returns an (n, 6) int32 array of (plane, a0, b0, a1, b1, key_index)
    and the matching uint32 keys.
    """
    D, A, B = g.shape
    # pass 1: count candidate faces to size the output
    count = 0
    for i in range(D):
        q = i + s
        for a in range(A):
            for b in range(B):
                val = g[i, a, b]
                if val == 0:
                    continue
                if q < 0 or q >= D:
                    if is_vertical_axis and s < 0:
                        continue
                elif g[q, a, b] != 0:
                    continue
                count += 1
    quads = np.empty((count, 5), dtype=np.int32)
    keys = np.empty(count, dtype=np.uint32)
    n = 0
    mask = np.zeros((A, B), dtype=np.uint32)
    for i in range(D):
        q = i + s
        any_face = False
        for a in range(A):
            for b in range(B):
                val = g[i, a, b]
                k = np.uint32(0)
                if val != 0:
                    exposed = True
                    if q < 0 or q >= D:
                        if is_vertical_axis and s < 0:
                            exposed = False
                    elif g[q, a, b] != 0:
                        exposed = False
                    if exposed:
                        k = face_keys[val, face_kind]
                        any_face = True
                mask[a, b] = k
        if not any_face:
            continue
        plane = i + 1 if s > 0 else i
        for a in range(A):
            b = 0
            while b < B:
                k = mask[a, b]
                if k == 0:
                    b += 1
                    continue
                wb = 1
                while b + wb < B and mask[a, b + wb] == k:
                    wb += 1
                wa = 1
                while a + wa < A:
                    ok = True
                    for bb in range(b, b + wb):
                        if mask[a + wa, bb] != k:
                            ok = False
                            break
                    if not ok:
                        break
                    wa += 1
                for aa in range(a, a + wa):
                    for bb in range(b, b + wb):
                        mask[aa, bb] = 0
                quads[n, 0] = plane
                quads[n, 1] = a
                quads[n, 2] = b
                quads[n, 3] = a + wa
                quads[n, 4] = b + wb
                keys[n] = k
                n += 1
                b += wb
    return quads[:n], keys[:n]


@dataclass
class MeshData:
    positions: np.ndarray  # (V, 3) int16 local voxel coordinates (y absolute level)
    colors: np.ndarray  # (V, 4) uint8 RGBA (A = shader class)
    indices: np.ndarray  # (I,) uint32

    @property
    def quad_count(self) -> int:
        return len(self.indices) // 6

    def is_empty(self) -> bool:
        return len(self.indices) == 0


_PERMS = {0: (0, 1, 2), 1: (1, 2, 0), 2: (2, 0, 1)}


def build_face_keys(max_value: int, building_colors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Lookup table ``(value, face_kind) -> key`` and ``key -> RGBA``.

    building_colors: (nb, 3, 4) uint8 [building][top/side/bottom][rgba].
    """
    class_table = M.class_color_table()
    rgba_list: list[tuple[int, int, int, int]] = [(0, 0, 0, 0)]
    lut_index: dict[tuple[int, int, int, int], int] = {(0, 0, 0, 0): 0}
    keys = np.zeros((max_value + 1, 3), dtype=np.uint32)

    def key_of(rgba) -> int:
        t = tuple(int(c) for c in rgba)
        if t not in lut_index:
            lut_index[t] = len(rgba_list)
            rgba_list.append(t)
        return lut_index[t]

    for v in range(1, min(M.NUM_CLASSES, max_value + 1)):
        for kind in range(3):
            if class_table[v, kind, :3].any():
                keys[v, kind] = key_of(class_table[v, kind])
    for bi in range(len(building_colors)):
        v = M.BUILDING_BASE + bi
        if v > max_value:
            break
        for kind in range(3):
            keys[v, kind] = key_of(building_colors[bi, kind])
    return keys, np.array(rgba_list, dtype=np.uint8)


def greedy_mesh(grid: np.ndarray, k_min: int, building_colors: np.ndarray) -> tuple[MeshData, MeshData]:
    """Mesh a tile grid. Returns (opaque mesh, water mesh)."""
    max_value = int(grid.max()) if grid.size else 0
    face_keys, palette = build_face_keys(max(max_value, M.NUM_CLASSES), building_colors)
    pos_parts: list[np.ndarray] = []
    key_parts: list[np.ndarray] = []
    for d in (0, 1, 2):
        perm = _PERMS[d]
        g = np.transpose(grid, perm)
        for s in (1, -1):
            kind = 1
            if d == 1:
                kind = 0 if s > 0 else 2
            quads, keys = _greedy_direction(g, s, d == 1, face_keys, kind)
            if len(quads) == 0:
                continue
            plane, a0, b0, a1, b1 = (quads[:, c] for c in range(5))
            if s > 0:
                corners = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
            else:
                corners = [(a0, b0), (a0, b1), (a1, b1), (a1, b0)]
            verts = np.empty((len(quads), 4, 3), dtype=np.int32)
            u_axis, v_axis = perm[1], perm[2]
            for ci, (ca, cb) in enumerate(corners):
                verts[:, ci, d] = plane
                verts[:, ci, u_axis] = ca
                verts[:, ci, v_axis] = cb
            pos_parts.append(verts)
            key_parts.append(keys)
    if not pos_parts:
        empty = MeshData(np.zeros((0, 3), np.int16), np.zeros((0, 4), np.uint8), np.zeros(0, np.uint32))
        return empty, empty
    verts = np.concatenate(pos_parts)  # (Q, 4, 3)
    keys = np.concatenate(key_parts)  # (Q,)
    verts[:, :, 1] += k_min
    rgba = palette[keys]  # (Q, 4)
    is_water = rgba[:, 3] == M.SHADER_WATER

    def assemble(sel: np.ndarray) -> MeshData:
        v = verts[sel]
        c = rgba[sel]
        q = len(v)
        positions = v.reshape(-1, 3).astype(np.int16)
        colors = np.repeat(c, 4, axis=0)
        base = (np.arange(q, dtype=np.uint32) * 4)[:, None]
        idx = (base + np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32)[None, :]).reshape(-1)
        return MeshData(positions, colors, idx)

    return assemble(~is_water), assemble(is_water)
