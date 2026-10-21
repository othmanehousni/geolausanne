"""Tile/quadtree math shared by every pipeline stage.

Conventions (mirrored in packages/geo-types/src/grid.ts):

* LV95 easting E grows east, northing N grows north, height H is LN02.
* World (three.js) coordinates: x = E - E0, y = H - H0, z = N0 - N
  (y up, z points south so that the scene is right-handed with north = -z).
* A tile of LOD ``l`` with voxel size ``v`` and tile size ``S = 128 v`` is
  addressed by integer indices ``(i, j)`` and covers
  ``E in [E0 + i S, E0 + (i + 1) S)`` and ``N in [N0 + j S, N0 + (j + 1) S)``.
* Inside a tile, local voxel coordinates are
  ``lx = (E - Emin) / v``, ``lz = (Nmax - N) / v`` and ``ly = (H - H0) / v``,
  so the glTF node translation is ``(i S, 0, -(j + 1) S)`` with a uniform
  scale of ``v``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterator

from . import config


@dataclass(frozen=True, order=True)
class TileKey:
    level: int
    i: int
    j: int

    @property
    def voxel_size(self) -> float:
        return config.LODS[self.level].voxel_size

    @property
    def tile_size(self) -> float:
        return config.LODS[self.level].tile_size

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """LV95 (west, south, east, north) of the tile."""
        s = self.tile_size
        w = config.ORIGIN_E + self.i * s
        so = config.ORIGIN_N + self.j * s
        return (w, so, w + s, so + s)

    @property
    def world_translation(self) -> tuple[float, float, float]:
        s = self.tile_size
        return (self.i * s, 0.0, -(self.j + 1) * s)

    @property
    def name(self) -> str:
        return f"{self.i}_{self.j}"

    @property
    def path(self) -> str:
        return f"lod{self.level}/{self.name}.glb"

    def parent(self) -> "TileKey":
        if self.level >= config.ROOT_LEVEL:
            raise ValueError("root tiles have no parent")
        return TileKey(self.level + 1, self.i // 2, self.j // 2)

    def children(self) -> list["TileKey"]:
        if self.level == 0:
            return []
        l = self.level - 1
        return [
            TileKey(l, 2 * self.i + di, 2 * self.j + dj)
            for dj in (0, 1)
            for di in (0, 1)
        ]

    def ancestor(self, level: int) -> "TileKey":
        if level < self.level:
            raise ValueError("ancestor level must be >= tile level")
        f = 2 ** (level - self.level)
        return TileKey(level, self.i // f, self.j // f)


def tiles_intersecting(level: int, bbox: tuple[float, float, float, float]) -> Iterator[TileKey]:
    """All tiles of ``level`` whose footprint intersects ``bbox`` (LV95)."""
    s = config.LODS[level].tile_size
    w, so, e, n = bbox
    i0 = math.floor((w - config.ORIGIN_E) / s)
    i1 = math.ceil((e - config.ORIGIN_E) / s) - 1
    j0 = math.floor((so - config.ORIGIN_N) / s)
    j1 = math.ceil((n - config.ORIGIN_N) / s) - 1
    for j in range(j0, j1 + 1):
        for i in range(i0, i1 + 1):
            yield TileKey(level, i, j)


def lv95_to_world(e: float, n: float, h: float) -> tuple[float, float, float]:
    return (e - config.ORIGIN_E, h - config.ORIGIN_H, config.ORIGIN_N - n)


def world_to_lv95(x: float, y: float, z: float) -> tuple[float, float, float]:
    return (x + config.ORIGIN_E, config.ORIGIN_N - z, y + config.ORIGIN_H)


def height_to_level(h: float, voxel_size: float) -> int:
    """Quantise an absolute height to the number of filled voxels below it.

    A column whose surface is at ``h`` is filled for voxel indices
    ``k < height_to_level(h)``; voxel ``k`` spans ``[H0 + k v, H0 + (k+1) v)``.
    Rounding to the nearest voxel boundary keeps the mean height unbiased.
    """
    return int(math.floor((h - config.ORIGIN_H) / voxel_size + 0.5))
