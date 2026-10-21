"""Voxel tree prefabs rendered with GPU instancing on LOD 0 tiles.

Each prefab is meshed once from a small voxel grid. Prefabs are centred on a
voxel *corner* so that 90 degree rotations keep every vertex on the integer
voxel lattice (trees stay perfectly aligned with the world grid).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from . import materials as M
from .mesh import MeshData, greedy_mesh
from .voxelize import stamp_trees


@dataclass(frozen=True)
class PrefabSpec:
    name: str
    height: float
    radius: float
    conifer: bool


PREFABS: tuple[PrefabSpec, ...] = (
    PrefabSpec("broadleaf-s", 6.0, 2.2, False),
    PrefabSpec("broadleaf-m", 11.0, 3.6, False),
    PrefabSpec("broadleaf-l", 18.0, 5.2, False),
    PrefabSpec("conifer-s", 8.0, 1.8, True),
    PrefabSpec("conifer-m", 15.0, 2.8, True),
    PrefabSpec("conifer-l", 24.0, 3.8, True),
)


@lru_cache(maxsize=None)
def prefab_mesh(index: int) -> MeshData:
    spec = PREFABS[index]
    r = int(np.ceil(spec.radius)) + 1
    size = 2 * r
    h = int(np.ceil(spec.height)) + 2
    grid = np.zeros((size, h, size), dtype=np.uint16)
    trees = np.array([[float(r), float(r), 0.0, spec.height, spec.radius, 1.0 if spec.conifer else 0.0]])
    stamp_trees(grid, 0, trees, 1.0, np.array([M.LEAVES, M.LEAVES_DARK], dtype=np.uint16))
    opaque, _ = greedy_mesh(grid, 0, np.zeros((0, 3, 4), np.uint8))
    pos = opaque.positions.astype(np.int32)
    pos[:, 0] -= r
    pos[:, 2] -= r
    return MeshData(pos.astype(np.int16), opaque.colors, opaque.indices)


def choose_prefab(height: float, radius: float, conifer: bool) -> int:
    best, best_d = 0, 1e9
    for i, p in enumerate(PREFABS):
        if p.conifer != conifer:
            continue
        d = abs(np.log(height / p.height)) + 0.5 * abs(np.log(radius / p.radius))
        if d < best_d:
            best, best_d = i, d
    return best


_Y_ROT = [
    (0.0, 0.0, 0.0, 1.0),
    (0.0, np.sqrt(0.5), 0.0, np.sqrt(0.5)),
    (0.0, 1.0, 0.0, 0.0),
    (0.0, np.sqrt(0.5), 0.0, -np.sqrt(0.5)),
]


def rotation_for(e: float, n: float) -> tuple[float, float, float, float]:
    h = np.sin(e * 3.17 + n * 7.31) * 9137.17
    return _Y_ROT[int((h - np.floor(h)) * 4) % 4]
