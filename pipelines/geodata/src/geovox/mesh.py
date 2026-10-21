"""Greedy meshing of voxel grids, with baked ambient occlusion.

Only faces between a solid voxel and air are emitted; coplanar neighbouring
faces with the same colour key are merged into maximal rectangles (the
classic "greedy meshing" algorithm), so a facade made of hundreds of voxels
becomes a handful of quads while still looking blocky.

Faces on the tile's side boundaries are always emitted (they form the
crack-hiding skirts); faces on the grid floor never are.

**Ambient occlusion.** Each face also gets the occlusion of its four corners
(0-3, from the voxels around the corner in the layer in front of the face:
two sides and the diagonal, the usual voxel AO). It darkens the foot of
walls and the ground along them, inner corners and the undersides of eaves.
The four values are part of the merge key, so only faces with the same
pattern merge: open faces (all zero) still merge as before. Who occludes whom
is chosen so the cost stays modest: building faces are occluded by anything
solid, ground faces only by buildings and bridges (terrain steps on slopes
would otherwise cut every hillside into strips). The values end up in the
two low bits of the vertex alpha (docs/pipeline/materials.md).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numba import njit

from . import materials as M

#: receivers: 0 = never occluded, 1 = occluded by any solid, 2 = only by buildings and bridges
RECV_NONE, RECV_ANY, RECV_BUILDINGS = 0, 1, 2


@njit(cache=True)
def _solid_at(g, q, a, b, A, B, mode, occluder):
    """1 when the voxel occludes: mode 1 = anything solid except
    ``occluder == 2`` (roof steps, for top faces), mode 2 = ``occluder >= 1``."""
    if a < 0 or a >= A or b < 0 or b >= B:
        return 0
    v = g[q, a, b]
    if v == 0:
        return 0
    if mode == 1:
        return 0 if occluder[v] == 2 else 1
    return 1 if occluder[v] >= 1 else 0


@njit(cache=True)
def _corner(s1, s2, c):
    if s1 and s2:
        return 3
    return s1 + s2 + c


@njit(cache=True)
def _face_ao(g, q, a, b, A, B, mode, occluder, vert_axis, ao_mode):
    """Occlusion of the four corners of the face at (a, b) whose front layer
    is ``q``, packed 2 bits each: (-a,-b), (+a,-b), (+a,+b), (-a,+b)."""
    am = _solid_at(g, q, a - 1, b, A, B, mode, occluder)
    ap = _solid_at(g, q, a + 1, b, A, B, mode, occluder)
    bm = _solid_at(g, q, a, b - 1, A, B, mode, occluder)
    bp = _solid_at(g, q, a, b + 1, A, B, mode, occluder)
    if ao_mode >= 2 and vert_axis >= 0:
        # walls: only the ground (or a lower roof) in front of their foot and
        # an overhang above their top; corners along the wall would split
        # every facade on a slope into strips
        if vert_axis == 0:
            lo, hi = am, ap
            c0 = 2 * lo
            c1 = 2 * hi
            c2 = 2 * hi
            c3 = 2 * lo
        else:
            lo, hi = bm, bp
            c0 = 2 * lo
            c1 = 2 * lo
            c2 = 2 * hi
            c3 = 2 * hi
        return c0 | (c1 << 2) | (c2 << 4) | (c3 << 6)
    if not (am or ap or bm or bp):
        if ao_mode >= 1:
            return 0
    c0 = _corner(am, bm, _solid_at(g, q, a - 1, b - 1, A, B, mode, occluder))
    c1 = _corner(ap, bm, _solid_at(g, q, a + 1, b - 1, A, B, mode, occluder))
    c2 = _corner(ap, bp, _solid_at(g, q, a + 1, b + 1, A, B, mode, occluder))
    c3 = _corner(am, bp, _solid_at(g, q, a - 1, b + 1, A, B, mode, occluder))
    return c0 | (c1 << 2) | (c2 << 4) | (c3 << 6)


@njit(cache=True)
def _greedy_direction(g, s, is_vertical_axis, face_keys, face_kind, recv, occluder, vert_axis=-1, ao_mode=2):
    """Greedy-merge all faces of one orientation.

    g: grid transposed so that axis 0 is the face normal axis, axes 1/2 are
    (a, b). Returns an (n, 5) int32 array of (plane, a0, b0, a1, b1) and the
    matching uint32 keys ``colour_key << 8 | ao``, where ``ao`` packs the
    occlusion of the corners (-a,-b), (+a,-b), (+a,+b), (-a,+b), 2 bits each.
    ``vert_axis`` says which of a (0) or b (1) is vertical for side faces
    (-1 for top and bottom faces).
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
                    inside = True
                    if q < 0 or q >= D:
                        inside = False
                        if is_vertical_axis and s < 0:
                            exposed = False
                    elif g[q, a, b] != 0:
                        exposed = False
                    if exposed:
                        ao = 0
                        mode = recv[val]
                        if mode != 0 and inside:
                            ao = _face_ao(g, q, a, b, A, B, mode, occluder, vert_axis, ao_mode)
                        k = (face_keys[val, face_kind] << np.uint32(8)) | np.uint32(ao)
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
    colors: np.ndarray  # (V, 4) uint8 RGBA (A = shader byte)
    indices: np.ndarray  # (I,) uint32

    @property
    def quad_count(self) -> int:
        return len(self.indices) // 6

    def is_empty(self) -> bool:
        return len(self.indices) == 0


_PERMS = {0: (0, 1, 2), 1: (1, 2, 0), 2: (2, 0, 1)}


def build_face_keys(max_value: int, building_colors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Lookup table ``(value, face_kind) -> key`` and ``key -> RGBA``.

    building_colors: (nb, 3, 4) uint8 [entry][top/side/bottom][rgba]; entry k
    is voxel value ``BUILDING_BASE + k``.
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


def occlusion_tables(max_value: int, roof_steps: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """``recv[value]`` (who gets ambient occlusion, how) and
    ``occluder[value]``: 1 for what darkens ground faces (buildings,
    bridges), 2 for the steps of pitched roofs, which darken nothing (their
    neighbouring steps would turn striped)."""
    recv = np.zeros(max_value + 1, dtype=np.uint8)
    occ = np.zeros(max_value + 1, dtype=np.uint8)
    ground = [
        M.SOIL, M.GRASS, M.MEADOW, M.FOREST, M.ROAD, M.ROAD_MAJOR, M.PAVEMENT, M.PATH, M.RAIL, M.SAND,
        M.ROCK, M.PARKING, M.PITCH, M.TRACK, M.PLAYGROUND, M.VINEYARD, M.CYCLEWAY, M.PLAZA,
        M.FIELD_GOLD, M.FIELD_GREEN, M.FIELD_BROWN, M.DIRT, M.FLOWERBED, M.GARDEN,
    ]
    for v in ground:
        if v <= max_value:
            recv[v] = RECV_BUILDINGS
    for v in (M.BRIDGE, M.PILLAR):
        if v <= max_value:
            recv[v] = RECV_ANY
            occ[v] = 1
    if max_value >= M.BUILDING_BASE:
        recv[M.BUILDING_BASE :] = RECV_ANY
        occ[M.BUILDING_BASE :] = 1
    if roof_steps is not None:
        steps = roof_steps[roof_steps <= max_value]
        occ[steps] = 2
    return recv, occ


def greedy_mesh(
    grid: np.ndarray,
    k_min: int,
    building_colors: np.ndarray,
    ao: bool = True,
    ao_mode: int = 2,
    roof_steps: np.ndarray | None = None,
) -> tuple[MeshData, MeshData]:
    """Mesh a tile grid. Returns (opaque mesh, water mesh).

    ``roof_steps`` lists the voxel values of pitched-roof steps (they do not
    darken the roof faces next to them)."""
    max_value = int(grid.max()) if grid.size else 0
    max_value = max(max_value, M.NUM_CLASSES)
    face_keys, palette = build_face_keys(max_value, building_colors)
    recv, occ = occlusion_tables(max_value, roof_steps)
    if not ao:
        recv[:] = RECV_NONE
    pos_parts: list[np.ndarray] = []
    key_parts: list[np.ndarray] = []
    ao_parts: list[np.ndarray] = []
    for d in (0, 1, 2):
        perm = _PERMS[d]
        g = np.transpose(grid, perm)
        for s in (1, -1):
            kind = 1
            if d == 1:
                kind = 0 if s > 0 else 2
            vert_axis = 0 if d == 0 else 1 if d == 2 else -1
            quads, keys = _greedy_direction(g, s, d == 1, face_keys, kind, recv, occ, vert_axis, ao_mode)
            if len(quads) == 0:
                continue
            plane, a0, b0, a1, b1 = (quads[:, c] for c in range(5))
            ao8 = keys & 0xFF
            corner_ao = [(ao8 >> sh) & 3 for sh in (0, 2, 4, 6)]  # (-a,-b), (+a,-b), (+a,+b), (-a,+b)
            if s > 0:
                corners = [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]
                vert_ao = [corner_ao[0], corner_ao[1], corner_ao[2], corner_ao[3]]
            else:
                corners = [(a0, b0), (a0, b1), (a1, b1), (a1, b0)]
                vert_ao = [corner_ao[0], corner_ao[3], corner_ao[2], corner_ao[1]]
            verts = np.empty((len(quads), 4, 3), dtype=np.int32)
            u_axis, v_axis = perm[1], perm[2]
            for ci, (ca, cb) in enumerate(corners):
                verts[:, ci, d] = plane
                verts[:, ci, u_axis] = ca
                verts[:, ci, v_axis] = cb
            pos_parts.append(verts)
            key_parts.append(keys >> 8)
            ao_parts.append(np.stack(vert_ao, axis=1).astype(np.uint8))
    if not pos_parts:
        empty = MeshData(np.zeros((0, 3), np.int16), np.zeros((0, 4), np.uint8), np.zeros(0, np.uint32))
        return empty, empty
    verts = np.concatenate(pos_parts)  # (Q, 4, 3)
    keys = np.concatenate(key_parts)  # (Q,)
    vao = np.concatenate(ao_parts)  # (Q, 4)
    verts[:, :, 1] += k_min
    rgba = palette[keys]  # (Q, 4)
    is_water = (rgba[:, 3] >> 5) == M.CLASS_WATER

    def assemble(sel: np.ndarray) -> MeshData:
        v = verts[sel]
        q = len(v)
        positions = v.reshape(-1, 3).astype(np.int16)
        colors = np.repeat(rgba[sel], 4, axis=0)
        colors[:, 3] |= vao[sel].reshape(-1)
        base = (np.arange(q, dtype=np.uint32) * 4)[:, None]
        idx = (base + np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32)[None, :]).reshape(-1)
        return MeshData(positions, colors, idx)

    return assemble(~is_water), assemble(is_water)
