"""Voxel materials: classes, the shader byte, and the colour model.

Voxel grids store ``uint16`` values: ``0`` is air, ``1..BUILDING_BASE-1`` are
the surface classes below and ``BUILDING_BASE + k`` is the k-th entry of the
tile's building table (its roof / wall / riser colours).

Vertex colours are RGBA8. RGB is the face colour, an **sRGB** albedo from the
palettes here (the client converts it to linear before lighting). A is the
*shader byte* (docs/pipeline/materials.md#the-shader-byte)::

    alpha = class << 5 | variant << 2 | ao

* ``class`` (3 bits): plain, wall, roof, leaves, water, road;
* ``variant`` (3 bits): per class (window style of a wall, roof material,
  ground pattern, conifer or broadleaf...);
* ``ao`` (2 bits): ambient occlusion of the vertex, baked by the mesher.

Keep the numbers in sync with apps/web/src/lib/world/materials.ts.

Colours portray reality from open data: roofs from the 10 cm orthophoto
(:func:`classify_roof`), facades from the building register's construction
period and class (:func:`facade_style`), ground from OpenStreetMap land use;
each lands on a curated pixel-art palette with a small, deterministic
per-building variation (:func:`stable_unit` of the building's UUID).
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import numpy as np

# ---------------------------------------------------------------------------
# Voxel classes
# ---------------------------------------------------------------------------

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
LEAVES_DARK = 21  # conifers
TRUNK = 22
CYCLEWAY = 23
PLAZA = 24
FIELD_GOLD = 25  # cereals, stubble
FIELD_GREEN = 26  # young crops, fodder
FIELD_BROWN = 27  # ploughed
WATER_SHALLOW = 28  # near the shore, rivers
WATER_DEEP = 29  # open lake
DIRT = 30  # construction sites, bare ground
LEAVES_LIGHT = 31  # light broadleaf crowns
CONIFER_BLUE = 32  # blue-green conifers
POOL = 33  # swimming pools
FLOWERBED = 34
GARDEN = 35  # allotments: small plots
NUM_CLASSES = 36

#: first building value; classes stay below it
BUILDING_BASE = 64

# ---------------------------------------------------------------------------
# The shader byte
# ---------------------------------------------------------------------------

CLASS_PLAIN = 0
CLASS_WALL = 1
CLASS_ROOF = 2
CLASS_LEAVES = 3
CLASS_WATER = 4
CLASS_ROAD = 5


def shader_byte(cls: int, variant: int = 0) -> int:
    """Alpha of a vertex colour before ambient occlusion (``ao`` bits zero)."""
    if not (0 <= cls < 8 and 0 <= variant < 8):
        raise ValueError((cls, variant))
    return (cls << 5) | (variant << 2)


def shader_class(alpha: int | np.ndarray):
    return np.asarray(alpha) >> 5


# class bytes (variant 0) - the values the first tile format used
SHADER_PLAIN = shader_byte(CLASS_PLAIN)
SHADER_WALL = shader_byte(CLASS_WALL)
SHADER_ROOF = shader_byte(CLASS_ROOF)
SHADER_LEAVES = shader_byte(CLASS_LEAVES)
SHADER_WATER = shader_byte(CLASS_WATER)
SHADER_ROAD = shader_byte(CLASS_ROAD)
AO_MASK = 0b11

# plain (ground) variants: procedural patterns in the client
GROUND_PLAIN = 0
GROUND_LAWN = 1
GROUND_PITCH = 2  # mowing stripes
GROUND_ROWS = 3  # crop rows, allotments
GROUND_VINES = 4  # vine rows
GROUND_PAVING = 5
GROUND_BALLAST = 6
GROUND_FLOWERS = 7

# wall variants: window styles
WINDOWS_RESIDENTIAL = 0
WINDOWS_OLD = 1  # tall narrow windows, 3.3 m storeys
WINDOWS_GLASS = 2  # curtain walls, ribbon glazing
WINDOWS_INDUSTRIAL = 3  # high strips, sparse
WINDOWS_CHURCH = 4  # tall slots, wide spacing
WINDOWS_NONE = 5
WINDOWS_BARN = 6  # boarding, no windows
WINDOWS_BLOCK = 7  # post-war blocks and towers: tight grid, balcony bands

# roof variants: material patterns
ROOF_PLAIN = 0
ROOF_TILES = 1
ROOF_SOLAR = 2
ROOF_GREEN = 3
ROOF_COPPER = 4
ROOF_GLASS = 5

# leaves variants
LEAF_BROADLEAF = 0
LEAF_CONIFER = 1

# water variants
WATER_LAKE = 0
WATER_RIVER = 1
WATER_POOL = 2


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


# ---------------------------------------------------------------------------
# Ground palette: (top, side, shader byte)
# ---------------------------------------------------------------------------

_P = SHADER_PLAIN
_CLASS_COLORS: dict[int, tuple[str, str, int]] = {
    SOIL: ("#93714f", "#86663f", _P),
    GRASS: ("#78ae48", "#65943d", shader_byte(CLASS_PLAIN, GROUND_LAWN)),
    MEADOW: ("#a4bd5b", "#8da24e", shader_byte(CLASS_PLAIN, GROUND_LAWN)),
    FOREST: ("#4b7836", "#41672f", _P),
    ROAD: ("#5a5e67", "#51555d", SHADER_ROAD),
    ROAD_MAJOR: ("#4f535b", "#474b52", SHADER_ROAD),
    PAVEMENT: ("#b9b1a3", "#a59d90", _P),
    PATH: ("#c9a774", "#b39266", _P),
    RAIL: ("#8b8478", "#7a7369", shader_byte(CLASS_PLAIN, GROUND_BALLAST)),
    WATER: ("#3a83c2", "#3474ad", shader_byte(CLASS_WATER, WATER_LAKE)),
    SAND: ("#e6d39b", "#d1be86", _P),
    ROCK: ("#a19e97", "#8d8a83", _P),
    PARKING: ("#6b6f77", "#61656c", SHADER_ROAD),
    PITCH: ("#4fa64e", "#47944a", shader_byte(CLASS_PLAIN, GROUND_PITCH)),
    TRACK: ("#c3613f", "#ad5638", _P),
    PLAYGROUND: ("#dcb987", "#c7a576", _P),
    VINEYARD: ("#86a447", "#73903e", shader_byte(CLASS_PLAIN, GROUND_VINES)),
    BRIDGE: ("#6a6e76", "#a8a194", _P),
    PILLAR: ("#aca69b", "#9f998e", _P),
    LEAVES: ("#5c9c3c", "#4f8834", shader_byte(CLASS_LEAVES, LEAF_BROADLEAF)),
    LEAVES_DARK: ("#34603b", "#2d5434", shader_byte(CLASS_LEAVES, LEAF_CONIFER)),
    TRUNK: ("#6b4e36", "#5c432f", _P),
    CYCLEWAY: ("#6a6872", "#605e67", SHADER_ROAD),
    PLAZA: ("#c8bda9", "#b3a895", shader_byte(CLASS_PLAIN, GROUND_PAVING)),
    FIELD_GOLD: ("#d3b965", "#bba25a", shader_byte(CLASS_PLAIN, GROUND_ROWS)),
    FIELD_GREEN: ("#8db753", "#7a9f49", shader_byte(CLASS_PLAIN, GROUND_ROWS)),
    FIELD_BROWN: ("#9d7b55", "#896b4a", shader_byte(CLASS_PLAIN, GROUND_ROWS)),
    WATER_SHALLOW: ("#4b9fc6", "#4289ad", shader_byte(CLASS_WATER, WATER_RIVER)),
    WATER_DEEP: ("#2f6dac", "#2b6198", shader_byte(CLASS_WATER, WATER_LAKE)),
    DIRT: ("#a68660", "#917452", _P),
    LEAVES_LIGHT: ("#79ae47", "#699a3e", shader_byte(CLASS_LEAVES, LEAF_BROADLEAF)),
    CONIFER_BLUE: ("#2f5648", "#294c3f", shader_byte(CLASS_LEAVES, LEAF_CONIFER)),
    POOL: ("#58c4d8", "#e3e6e3", shader_byte(CLASS_WATER, WATER_POOL)),
    FLOWERBED: ("#7f9f45", "#6d8a3c", shader_byte(CLASS_PLAIN, GROUND_FLOWERS)),
    GARDEN: ("#8aa552", "#778f47", shader_byte(CLASS_PLAIN, GROUND_ROWS)),
}

#: the land cover classes that are water (rendered with the water material)
WATER_CLASSES = (WATER, WATER_SHALLOW, WATER_DEEP, POOL)


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


# ---------------------------------------------------------------------------
# Colour science
# ---------------------------------------------------------------------------

_M_RGB2XYZ = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB 0..255 (..., 3) -> CIELAB (D65)."""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ _M_RGB2XYZ.T / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


_srgb_to_lab = srgb_to_lab  # former name


def lab_to_srgb(lab: np.ndarray) -> np.ndarray:
    """CIELAB (..., 3) -> sRGB 0..255 (float, clipped)."""
    lab = np.asarray(lab, dtype=np.float64)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200

    def finv(f):
        return np.where(f > 6 / 29, f**3, 3 * (6 / 29) ** 2 * (f - 4 / 29))

    xyz = np.stack([finv(fx), finv(fy), finv(fz)], -1) * _WHITE
    c = xyz @ np.linalg.inv(_M_RGB2XYZ).T
    c = np.clip(c, 0, None)
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.clip(c * 255, 0, 255)


#: CSS colour names that OpenStreetMap mappers use for buildings and roofs
_NAMED = {
    "white": "#ffffff", "whitesmoke": "#f5f5f5", "ivory": "#fffff0", "snow": "#fffafa", "linen": "#faf0e6",
    "beige": "#f5f5dc", "wheat": "#f5deb3", "tan": "#d2b48c", "khaki": "#f0e68c", "burlywood": "#deb887",
    "lightyellow": "#ffffe0", "yellow": "#ffd700", "gold": "#ffd700", "orange": "#e8833a", "cream": "#f2e8c9",
    "lightgrey": "#d3d3d3", "lightgray": "#d3d3d3", "silver": "#c0c0c0", "grey": "#808080", "gray": "#808080",
    "darkgrey": "#a9a9a9", "darkgray": "#a9a9a9", "dimgray": "#696969", "dimgrey": "#696969",
    "anthracite": "#3b3e43", "black": "#202020", "brown": "#8b4a2b", "saddlebrown": "#8b4513",
    "sienna": "#a0522d", "maroon": "#800000", "red": "#b03a2e", "darkred": "#8b0000", "pink": "#f2b8c0",
    "salmon": "#e9967a", "peru": "#cd853f", "green": "#4c7d3a", "darkgreen": "#2f5a2a", "olive": "#808000",
    "blue": "#3b5b9a", "lightblue": "#add8e6", "navy": "#1f2f5a", "teal": "#2f7f7f", "copper": "#5f9c8a",
}


def parse_colour(value: str | None) -> tuple[int, int, int] | None:
    """An OSM colour value (``#rrggbb``, ``#rgb`` or a CSS name) as sRGB."""
    if not value:
        return None
    v = value.strip().lower().split(";")[0].strip()
    if v in _NAMED:
        v = _NAMED[v]
    if v.startswith("#") and len(v) == 4:
        v = "#" + "".join(ch * 2 for ch in v[1:])
    if v.startswith("#") and len(v) == 7:
        try:
            return _hex(v)
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# Roofs
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RoofSample:
    """Robust colour of a roof in the orthophoto (CIELAB of the sunlit
    pixels) and the share of pixels that look like vegetation or solar
    panels."""

    L: float
    a: float
    b: float
    pixels: int
    green: float = 0.0
    solar: float = 0.0

    @property
    def chroma(self) -> float:
        return math.hypot(self.a, self.b)

    @property
    def hue(self) -> float:
        return math.degrees(math.atan2(self.b, self.a)) % 360


#: family -> ([light, mid, dark] shades, roof variant, (L* below which the
#: dark shade is used, L* above which the light one is), photo L* bounds)
ROOF_FAMILIES: dict[str, tuple[tuple[str, str, str], int, tuple[float, float]]] = {
    "terracotta": (("#cc744b", "#b9613f", "#9e5037"), ROOF_TILES, (50.0, 60.0)),
    "brown": (("#a2735b", "#8b5f4b", "#704c3e"), ROOF_TILES, (44.0, 54.0)),
    "sand": (("#d5b99c", "#c3a386", "#ab8b70"), ROOF_TILES, (62.0, 70.0)),
    "slate": (("#5f6570", "#4e545e", "#3e434c"), ROOF_PLAIN, (36.0, 43.0)),
    "metal": (("#9aa1a8", "#868c94", "#70767e"), ROOF_PLAIN, (52.0, 62.0)),
    "gravel": (("#c1bdb2", "#aeaaa0", "#99968d"), ROOF_PLAIN, (55.0, 66.0)),
    "membrane": (("#e7e5df", "#d9d7cf", "#cac8c0"), ROOF_PLAIN, (72.0, 80.0)),
    "green": (("#88a35b", "#718e4d", "#5b7741"), ROOF_GREEN, (45.0, 55.0)),
    "copper": (("#7ab7a3", "#60a08c", "#4d8676"), ROOF_COPPER, (50.0, 60.0)),
    "solar": (("#40557a", "#314463", "#25344d"), ROOF_SOLAR, (30.0, 38.0)),
    "glass": (("#c7d7db", "#b2c5cb", "#9fb4bb"), ROOF_GLASS, (60.0, 72.0)),
}
ROOF_FAMILY_ORDER = tuple(ROOF_FAMILIES)

#: CIELAB chroma below which a roof photo counts as neutral grey. SWISSIMAGE
#: is hazy: clay tiles measure C* 6-17, flat gravel 1-5 (docs/pipeline/materials.md).
NEUTRAL_CHROMA = 3.2


def _shade(family: str, L: float, uuid: str) -> tuple[int, int, int]:
    shades, _variant, (lo, hi) = ROOF_FAMILIES[family]
    j = (stable_unit(uuid + "shade") - 0.5) * 8.0  # +-4 L*: neighbours differ a little
    x = L + j
    return _hex(shades[2] if x < lo else shades[0] if x > hi else shades[1])


def roof_family(s: RoofSample | None, pitched: float, uuid: str = "", hint: str | None = None) -> str:
    """Which roof family a photo sample belongs to (hue family true to the
    photo; the roof shape breaks ties among neutral or weak colours)."""
    if hint is not None:
        return hint
    is_pitched = pitched >= 0.45
    if s is None or s.pixels < 8 or not np.isfinite(s.L):
        # no usable photo: the shape is the prior (Lausanne's pitched roofs
        # are mostly clay tiles, flat roofs gravel or membranes)
        u = stable_unit(uuid + "roof")
        if is_pitched:
            return "terracotta" if u < 0.62 else "brown" if u < 0.85 else "slate"
        return "gravel" if u < 0.7 else "membrane" if u < 0.88 else "metal"
    if s.green >= 0.5:
        return "green"
    if s.solar >= 0.45:
        return "solar"
    L, a, b, C, h = s.L, s.a, s.b, s.chroma, s.hue
    if C >= NEUTRAL_CHROMA:
        if 10.0 <= h < 85.0:  # orange-red-yellow: clay and its relatives
            if is_pitched:
                if L >= 64.0 and C < 9.0:
                    return "sand"
                return "terracotta" if (C >= 6.5 or a >= 4.5) else "brown"
            if C >= 10.0 and a >= 5.0:
                return "terracotta"
            if L >= 62.0:
                return "sand" if C >= 6.0 else "gravel"
            return "brown" if C >= 5.0 else "gravel"
        if 85.0 <= h < 160.0:  # yellow-green to green
            if C >= 6.0:
                return "green"
        elif 160.0 <= h < 205.0:  # teal: verdigris
            if C >= 4.0:
                return "copper" if L >= 40.0 else "solar"
        elif 205.0 <= h < 330.0:  # blue to violet: panels, glass, blue metal
            return "solar" if L < 48.0 else "metal"
        else:  # red-pink
            return "terracotta" if is_pitched else "brown"
    # neutral (or weakly coloured): dark and clearly blue is a PV array
    if L < 40.0 and b < -3.0:
        return "solar"
    if is_pitched:
        return "slate" if L < 47.0 else "metal"
    if L < 44.0:
        return "slate"
    return "gravel" if L < 70.0 else "membrane"


def classify_roof(
    s: RoofSample | None, pitched: float, uuid: str, hint: str | None = None
) -> tuple[str, tuple[int, int, int], int]:
    """(family, sRGB colour, roof shader variant) of a building's roof."""
    fam = roof_family(s, pitched, uuid, hint)
    L = s.L if (s is not None and s.pixels >= 8 and np.isfinite(s.L)) else float(np.mean(ROOF_FAMILIES[fam][2]))
    return fam, _shade(fam, L, uuid), ROOF_FAMILIES[fam][1]


def snap_roof_color(rgb: tuple[float, float, float] | None, uuid: str, pitched: float = 0.0) -> tuple[int, int, int]:
    """Roof colour from a single sRGB sample (no pixel statistics)."""
    if rgb is None or any(np.isnan(rgb)):
        return classify_roof(None, pitched, uuid)[1]
    L, a, b = srgb_to_lab(np.array(rgb, dtype=float)[None, :])[0]
    return classify_roof(RoofSample(float(L), float(a), float(b), 64), pitched, uuid)[1]


# ---------------------------------------------------------------------------
# Facades
# ---------------------------------------------------------------------------

FACADE_PALETTES: dict[str, tuple[str, ...]] = {
    # before 1919: molasse sandstone (grey-green, beige), cream and ochre
    # renders, salmon and pale yellow facades of the 19th century
    "old": ("#bfbc9a", "#cfc3a0", "#e2d4b4", "#dcc088", "#e4cc98", "#dcae95", "#cfc6b3", "#c4ae88", "#d6caae"),
    # 1919-1945: cream and beige renders, travertine
    "interwar": ("#e0d3b8", "#d6c7a6", "#d3ba94", "#d7b9a2", "#cdc6b6", "#e2d8c2"),
    # 1946-1970: light concrete, white render, pastel blocks
    "postwar": ("#d3d0c6", "#e4e1d8", "#c6cac3", "#ddd2ae", "#c9bfab", "#bec4c9"),
    # 1971-2000: concrete, off-white, brown and sand claddings
    "late": ("#c0bcb1", "#dfdad0", "#c9b296", "#d3c4aa", "#b8a186", "#cfcbc0"),
    # 2001 on: white, greys, a few anthracite and timber facades
    "recent": ("#eae8e2", "#d2d4d2", "#c1c5c8", "#dfd5c0", "#eae8e2", "#d2d4d2", "#a2a6a9", "#666b72", "#ae8862"),
    "glass": ("#8fa4b3", "#a1b2bf", "#7e94a6", "#b7c0c7", "#98aaa6"),
    "industrial": ("#aab1b5", "#c3c5c0", "#cbc0a8", "#909ba1", "#dadad3", "#b9b2a4"),
    "stone": ("#bdb89d", "#cdc3a7", "#d8d1c0", "#c4b896"),
    "barn": ("#8c6b4d", "#9f7b56", "#7c5d43", "#e4dccb"),
    "tank": ("#e4e5e1", "#cfd2d0"),
    "greenhouse": ("#c6d7d5",),
    "construction": ("#b8b5ad",),
    "brick": ("#b26c55", "#a35f4a"),
}


@dataclass(frozen=True)
class GwrInfo:
    """What the building register says about a building."""

    year: int | None  # construction year (GBAUJ) or the middle of its period (GBAUP)
    klass: int | None  # GKLAS (1110 single house ... 1278 farm buildings)
    category: int | None = None  # GKAT
    floors: int | None = None  # GASTW


#: GBAUP construction periods -> a representative year
PERIOD_YEAR = {
    8011: 1890, 8012: 1932, 8013: 1953, 8014: 1965, 8015: 1975, 8016: 1983, 8017: 1988,
    8018: 1993, 8019: 1998, 8020: 2003, 8021: 2008, 8022: 2013, 8023: 2019,
}

_OLD_HINT = ("terracotta", "brown", "sand")


def era_palette(year: int) -> str:
    if year < 1919:
        return "old"
    if year < 1946:
        return "interwar"
    if year < 1971:
        return "postwar"
    if year < 2001:
        return "late"
    return "recent"


def facade_style(
    uuid: str,
    objektart: str,
    gwr: GwrInfo | None = None,
    roof_family: str | None = None,
    osm: dict[str, str] | None = None,
) -> tuple[str, tuple[int, int, int], int]:
    """(palette, sRGB wall colour, window style) of a building."""
    osm = osm or {}
    oa = objektart or ""
    klass = gwr.klass if gwr else None
    year = gwr.year if gwr else None
    u = stable_unit(uuid + "wall")

    def pick(name: str, windows: int) -> tuple[str, tuple[int, int, int], int]:
        pal = FACADE_PALETTES[name]
        return name, _hex(pal[int(u * len(pal)) % len(pal)]), windows

    # explicit facade colour or material from OpenStreetMap
    material = (osm.get("building:material") or osm.get("building:facade:material") or "").lower()
    colour = parse_colour(osm.get("building:colour"))
    if colour is not None:
        return "osm", snap_to_facade_palette(colour), _windows_for(klass, year, oa)
    if material in ("glass", "mirror"):
        return pick("glass", WINDOWS_GLASS)
    if material in ("metal", "steel", "aluminium"):
        return pick("industrial", WINDOWS_INDUSTRIAL)
    if material in ("brick",):
        return pick("brick", _windows_for(klass, year, oa))
    if material in ("wood", "timber_framing"):
        return pick("barn", WINDOWS_RESIDENTIAL)
    if material in ("stone", "sandstone", "limestone"):
        return pick("stone", WINDOWS_OLD)

    # special structures of swissBUILDINGS3D
    if oa in ("Sakrales Gebaeude", "Sakraler Turm", "Kapelle") or klass == 1272:
        return pick("stone", WINDOWS_CHURCH)
    if oa == "Lagertank":
        return pick("tank", WINDOWS_NONE)
    if oa == "Treibhaus" or klass == 1277:
        return pick("greenhouse", WINDOWS_NONE)
    if oa == "Im Bau":
        return pick("construction", WINDOWS_NONE)
    if oa in ("Mauer gross", "Mauer gross gedeckt", "Hochkamin", "Turm", "Unterirdisches Gebaeude"):
        return pick("stone" if (year or 2000) < 1919 else "industrial", WINDOWS_NONE)
    if oa in ("Offenes Gebaeude", "Flugdach", "Bruecke gedeckt", "Verbindungsbrücke"):
        return pick("industrial", WINDOWS_NONE)
    if klass == 1273:  # listed monument
        return pick("stone", WINDOWS_OLD)
    if klass in (1251, 1252, 1241, 1274):
        return pick("industrial", WINDOWS_INDUSTRIAL)
    if klass == 1242:  # garages
        return pick("industrial", WINDOWS_NONE)
    if klass in (1271, 1276, 1278):
        return pick("barn", WINDOWS_BARN)
    if klass in (1220, 1230) and year is not None and year >= 1971:
        return pick("glass", WINDOWS_GLASS)
    if klass == 1265:  # sports halls
        return pick("industrial", WINDOWS_INDUSTRIAL)

    if year is None:
        # no register entry: guess the era from the roof (clay roofs are
        # mostly older houses, flat roofs mostly post-war)
        if roof_family in _OLD_HINT:
            year = 1900 if stable_unit(uuid + "era") < 0.55 else 1935
        elif roof_family is not None:
            year = 1965 if stable_unit(uuid + "era") < 0.5 else 1990
        else:
            year = 1960
    name = era_palette(year)
    return pick(name, _windows_for(klass, year, oa))


def _windows_for(klass: int | None, year: int | None, objektart: str) -> int:
    if objektart == "Hochhaus":
        return WINDOWS_BLOCK
    if year is not None and year < 1919:
        return WINDOWS_OLD
    if klass in (1220, 1230) and year is not None and year >= 1961:
        return WINDOWS_GLASS
    if klass in (1122, 1130, 1263, 1264) and year is not None and 1946 <= year < 1991:
        return WINDOWS_BLOCK
    return WINDOWS_RESIDENTIAL


_FACADE_ALL = sorted({c for pal in FACADE_PALETTES.values() for c in pal})
_FACADE_LAB = srgb_to_lab(np.array([_hex(c) for c in _FACADE_ALL], dtype=float))


def snap_to_facade_palette(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    """Nearest facade palette colour in CIELAB (keeps the pixel-art palette)."""
    lab = srgb_to_lab(np.array(rgb, dtype=float)[None, :])[0]
    d = np.linalg.norm(_FACADE_LAB - lab, axis=1)
    return _hex(_FACADE_ALL[int(np.argmin(d))])


def wall_color(uuid: str, objektart: str) -> tuple[int, int, int]:
    """Facade colour without register data (kept for callers of the first model)."""
    return facade_style(uuid, objektart)[1]


# ---------------------------------------------------------------------------
# Building table rows
# ---------------------------------------------------------------------------


def building_rows(
    roof_rgb: tuple[int, int, int], roof_variant: int, wall_rgb: tuple[int, int, int], wall_variant: int
) -> np.ndarray:
    """``(4, 4)`` uint8 rows [roof top, wall side, roof riser side, underside]."""
    r, w = np.array(roof_rgb, float), np.array(wall_rgb, float)
    roof_b = shader_byte(CLASS_ROOF, roof_variant)
    out = np.zeros((4, 4), dtype=np.uint8)
    out[0] = (*roof_rgb, roof_b)
    out[1] = (*wall_rgb, shader_byte(CLASS_WALL, wall_variant))
    # the steps of a pitched roof read as roof, a shade darker than its top
    out[2] = (*np.clip(r * 0.9, 0, 255).astype(int), roof_b)
    out[3] = (*np.clip(w * 0.72, 0, 255).astype(int), shader_byte(CLASS_WALL, WINDOWS_NONE))
    return out
