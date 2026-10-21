"""Voxel material palette.

Voxel grids store ``uint16`` values: ``0`` is air, ``1..BUILDING_BASE-1`` are
the surface/terrain classes below and ``BUILDING_BASE + k`` is the k-th
building of the tile (its wall/roof colours come from the tile's building
table). Each face is coloured from (material, face direction).

Vertex colours are written as RGBA8: RGB is the face colour and A carries a
*shader class* that lets the web client add procedural detail (windows on
walls, ripples on water) without extra geometry. Keep SHADER_* in sync with
apps/web/src/lib/world/materials.ts.
"""

from __future__ import annotations

import hashlib

import numpy as np

AIR = 0
SOIL = 1
GRASS = 2
MEADOW = 3
FOREST = 4
ROAD = 5
ROAD_MAJOR = 6
PAVEMENT = 7
PATH = 8
RAIL = 9
WATER = 10
SAND = 11
ROCK = 12
PARKING = 13
PITCH = 14
TRACK = 15
PLAYGROUND = 16
VINEYARD = 17
BRIDGE = 18
PILLAR = 19
LEAVES = 20
LEAVES_DARK = 21
TRUNK = 22
CYCLEWAY = 23
PLAZA = 24
NUM_CLASSES = 25

BUILDING_BASE = 32

# Shader classes carried in the alpha channel of COLOR_0 (0..255).
SHADER_PLAIN = 0
SHADER_WALL = 32
SHADER_ROOF = 64
SHADER_LEAVES = 96
SHADER_WATER = 128
SHADER_ROAD = 160


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


# (top colour, side colour, shader class)
_CLASS_COLORS: dict[int, tuple[str, str, int]] = {
    SOIL: ("#8d6e4f", "#7b5d41", SHADER_PLAIN),
    GRASS: ("#7cb352", "#6b9a45", SHADER_PLAIN),
    MEADOW: ("#a3c062", "#8ea752", SHADER_PLAIN),
    FOREST: ("#557f3e", "#4a6e36", SHADER_PLAIN),
    ROAD: ("#5f636b", "#565a61", SHADER_ROAD),
    ROAD_MAJOR: ("#54585f", "#4c5056", SHADER_ROAD),
    PAVEMENT: ("#bdb6a9", "#a9a296", SHADER_PLAIN),
    PATH: ("#c8ab7d", "#b2966b", SHADER_PLAIN),
    RAIL: ("#83756a", "#74675d", SHADER_PLAIN),
    WATER: ("#3f86c6", "#3a79b2", SHADER_WATER),
    SAND: ("#e2d19a", "#cfbd86", SHADER_PLAIN),
    ROCK: ("#9d9b95", "#8a8882", SHADER_PLAIN),
    PARKING: ("#71757c", "#65696f", SHADER_PLAIN),
    PITCH: ("#5eaa58", "#55984f", SHADER_PLAIN),
    TRACK: ("#c4674c", "#ae5b43", SHADER_PLAIN),
    PLAYGROUND: ("#d9b98e", "#c4a67c", SHADER_PLAIN),
    VINEYARD: ("#8fa851", "#7a8f46", SHADER_PLAIN),
    BRIDGE: ("#686c73", "#a39d93", SHADER_PLAIN),
    PILLAR: ("#aaa49a", "#9d978d", SHADER_PLAIN),
    LEAVES: ("#5c9a3e", "#4f8735", SHADER_LEAVES),
    LEAVES_DARK: ("#3f6f3a", "#365f32", SHADER_LEAVES),
    TRUNK: ("#6e5038", "#5f4430", SHADER_PLAIN),
    CYCLEWAY: ("#6c6a73", "#605e66", SHADER_ROAD),
    PLAZA: ("#cfc6b6", "#bbb2a2", SHADER_PLAIN),
}

#: Facade palette inspired by Lausanne's molasse sandstone, plaster and concrete.
WALL_PALETTE = [
    "#e9dfcb",  # cream plaster
    "#ddd2bd",  # warm beige
    "#d6c9ac",  # molasse sandstone
    "#c9c1b0",  # greige
    "#efece4",  # off-white
    "#d9cfc2",  # pale stone
    "#cbb79a",  # ochre sandstone
    "#bfc0bc",  # light concrete
    "#e3d6bf",  # sand
    "#d3c3b4",  # rosy beige
]
INDUSTRIAL_WALLS = ["#b8bab8", "#a9adb0", "#c4c2bb"]

#: Roof palette; observed orthophoto roof colours are snapped to these.
ROOF_PALETTE = [
    "#b35a3f",  # terracotta tiles
    "#9a4e3a",  # dark terracotta
    "#7d5a4d",  # brown tiles
    "#5a5d63",  # dark slate / zinc
    "#7f8287",  # grey sheet metal
    "#a3a49f",  # concrete / gravel
    "#c4c0b6",  # light membrane
    "#6f8e57",  # green roof
    "#5f8f86",  # copper patina
    "#8a6f5c",  # weathered tiles
]


def class_top_side(cls: int) -> tuple[tuple[int, int, int], tuple[int, int, int], int]:
    top, side, shader = _CLASS_COLORS[cls]
    return _hex(top), _hex(side), shader


def class_color_table() -> np.ndarray:
    """``(NUM_CLASSES, 3, 4)`` uint8: [class][face kind][rgba] with face kind
    0 = top, 1 = side, 2 = bottom."""
    t = np.zeros((NUM_CLASSES, 3, 4), dtype=np.uint8)
    for cls, (top, side, shader) in _CLASS_COLORS.items():
        tr, sr = _hex(top), _hex(side)
        br = tuple(int(c * 0.82) for c in sr)
        t[cls, 0] = (*tr, shader)
        t[cls, 1] = (*sr, shader)
        t[cls, 2] = (*br, shader)
    return t


def stable_unit(key: str) -> float:
    """Deterministic pseudo-random number in [0, 1) derived from ``key``."""
    h = hashlib.blake2b(key.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(h, "little") / 2**64


def wall_color(uuid: str, objektart: str) -> tuple[int, int, int]:
    palette = INDUSTRIAL_WALLS if "Industrie" in objektart or "Offenes" in objektart else WALL_PALETTE
    return _hex(palette[int(stable_unit(uuid + "wall") * len(palette))])


def _srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


_ROOF_LAB = _srgb_to_lab(np.array([_hex(c) for c in ROOF_PALETTE], dtype=float))


def snap_roof_color(rgb: tuple[float, float, float] | None, uuid: str) -> tuple[int, int, int]:
    """Snap an observed (orthophoto) roof colour to the curated roof palette."""
    if rgb is None or any(np.isnan(rgb)):
        return _hex(ROOF_PALETTE[int(stable_unit(uuid + "roof") * 6)])
    # orthophotos are darker/greyer than the stylised palette; boost a little
    obs = np.clip(np.array(rgb, dtype=float) * 1.15, 0, 255)
    lab = _srgb_to_lab(obs[None, :])[0]
    d = np.linalg.norm(_ROOF_LAB - lab, axis=1)
    return _hex(ROOF_PALETTE[int(np.argmin(d))])
