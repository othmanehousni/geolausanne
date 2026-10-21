"""Surface classification: OpenStreetMap features fused with the orthophoto.

The result is a north-up ``uint8`` raster of material classes (see
:mod:`geovox.materials`) at 1 m resolution for a processing block. Lines
(roads, rails, rivers) are buffered by their real or typical width. Bridges
are returned separately because their deck floats above the terrain.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import shapely
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy import ndimage

from . import materials as M
from .osm import Feature

# Typical carriageway widths in metres when OSM has no width/lanes tag.
ROAD_WIDTH = {
    "motorway": 14.0, "motorway_link": 7.0, "trunk": 12.0, "trunk_link": 7.0,
    "primary": 10.0, "primary_link": 6.0, "secondary": 9.0, "secondary_link": 6.0,
    "tertiary": 8.0, "tertiary_link": 5.0, "unclassified": 6.0, "residential": 6.0,
    "living_street": 5.0, "service": 4.0, "road": 6.0, "busway": 6.0,
    "pedestrian": 5.0, "footway": 2.5, "cycleway": 2.5, "path": 2.0, "track": 3.0,
    "steps": 2.5, "bridleway": 2.0, "corridor": 2.0, "platform": 3.0,
}
MAJOR = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary"}
PAVED_SURFACES = {"asphalt", "paved", "concrete", "paving_stones", "sett", "concrete:plates", "cobblestone"}

# (priority, class) for area features. Higher priority is painted later.
LEAF_UNKNOWN, LEAF_BROAD, LEAF_NEEDLE, LEAF_MIXED = 0, 1, 2, 3


@dataclass
class Bridge:
    geom: shapely.Geometry  # deck footprint (LV95)
    centerline: shapely.Geometry
    material: int
    layer: int


@dataclass
class Landcover:
    cls: np.ndarray  # (rows, cols) uint8
    leaf: np.ndarray  # (rows, cols) uint8 leaf type for forests
    osm_buildings: np.ndarray  # (rows, cols) bool footprint mask from OSM
    bridges: list[Bridge]


def _is_true(v: str | None) -> bool:
    return v is not None and v not in ("no", "false", "0")


def _layer(f: Feature) -> int:
    try:
        return int(float(f.get("layer", "0") or 0))
    except ValueError:
        return 0


def _width(f: Feature, default: float) -> float:
    w = f.get("width") or f.get("est_width")
    if w:
        try:
            return max(1.0, min(40.0, float(w.replace("m", "").replace(",", ".").strip().split()[0])))
        except (ValueError, IndexError):
            pass
    lanes = f.get("lanes")
    if lanes:
        try:
            return max(default, min(30.0, float(lanes.split(";")[0]) * 3.25))
        except ValueError:
            pass
    return default


def road_class(f: Feature) -> tuple[int, float] | None:
    """Material and width of a highway line, or None if it is not drawn."""
    hw = f.get("highway")
    if hw is None or hw in ("proposed", "construction", "abandoned", "razed", "elevator", "bus_stop"):
        return None
    if hw not in ROAD_WIDTH:
        return None
    width = _width(f, ROAD_WIDTH[hw])
    surface = f.get("surface")
    if hw in ("footway", "steps", "corridor", "platform"):
        mat = M.PAVEMENT if (surface is None or surface in PAVED_SURFACES) else M.PATH
    elif hw in ("path", "track", "bridleway"):
        mat = M.PAVEMENT if surface in PAVED_SURFACES else M.PATH
    elif hw == "cycleway":
        mat = M.CYCLEWAY
    elif hw == "pedestrian":
        mat = M.PLAZA
    elif hw in MAJOR:
        mat = M.ROAD_MAJOR
    else:
        mat = M.ROAD
    return mat, width


def _area_class(f: Feature) -> tuple[int, int] | None:
    """(priority, class) for polygon features."""
    t = f.tags
    natural, landuse, leisure, amenity = t.get("natural"), t.get("landuse"), t.get("leisure"), t.get("amenity")
    if natural == "water" or t.get("water") or t.get("waterway") == "riverbank" or landuse in ("reservoir", "basin"):
        return (90, M.WATER)
    if t.get("highway") in ("pedestrian", "footway") or t.get("area:highway") in ("pedestrian", "footway") or t.get("place") == "square":
        return (60, M.PLAZA)
    if t.get("area:highway") is not None:
        return (55, M.ROAD)
    if amenity == "parking" and t.get("parking", "surface") in ("surface", "lane"):
        return (50, M.PARKING)
    if leisure == "pitch":
        return (45, M.PITCH)
    if leisure == "track":
        return (46, M.TRACK)
    if leisure == "playground":
        return (44, M.PLAYGROUND)
    if natural in ("beach", "sand") or leisure == "beach_resort":
        return (40, M.SAND)
    if natural in ("bare_rock", "scree", "cliff", "shingle"):
        return (40, M.ROCK)
    if landuse in ("forest",) or natural in ("wood",):
        return (20, M.FOREST)
    if natural in ("scrub", "heath") or landuse == "orchard":
        return (22, M.MEADOW)
    if landuse == "vineyard":
        return (24, M.VINEYARD)
    if landuse in ("farmland", "meadow", "farmyard", "allotments", "plant_nursery") or natural == "grassland":
        return (18, M.MEADOW)
    if leisure in ("park", "garden", "golf_course", "nature_reserve", "dog_park") or landuse in (
        "grass", "village_green", "recreation_ground", "cemetery", "greenfield",
    ):
        return (25, M.GRASS)
    if landuse == "railway":
        return (12, M.RAIL)
    return None


def _leaf(f: Feature) -> int:
    lt = f.get("leaf_type")
    return {"broadleaved": LEAF_BROAD, "needleleaved": LEAF_NEEDLE, "mixed": LEAF_MIXED}.get(lt or "", LEAF_UNKNOWN)


def majority_filter(labels: np.ndarray, classes: list[int], size: int) -> np.ndarray:
    """Mode filter restricted to ``classes`` (cheap: one box filter per class)."""
    best = labels.copy()
    best_count = np.full(labels.shape, -1.0, dtype=np.float32)
    for c in classes:
        cnt = ndimage.uniform_filter((labels == c).astype(np.float32), size=size, mode="nearest")
        better = cnt > best_count
        best[better] = c
        best_count[better] = cnt[better]
    return best


def remove_small_regions(labels: np.ndarray, min_cells: int) -> np.ndarray:
    """Merge connected regions smaller than ``min_cells`` into their surroundings."""
    out = labels.copy()
    small = np.zeros(labels.shape, dtype=bool)
    for c in np.unique(labels):
        lab, n = ndimage.label(labels == c)
        if n == 0:
            continue
        sizes = np.bincount(lab.ravel())
        tiny = sizes < min_cells
        tiny[0] = False
        small |= tiny[lab]
    if small.any():
        # nearest non-small cell provides the replacement class
        idx = ndimage.distance_transform_edt(small, return_distances=False, return_indices=True)
        out[small] = labels[tuple(i[small] for i in idx)]
    return out


def _ortho_base(rgb: np.ndarray) -> np.ndarray:
    """Default surface where OSM is silent: vegetated -> grass, dark -> asphalt,
    else paved. Heavily smoothed: voxels read better (and mesh far smaller)
    with clean regions than with per-pixel orthophoto noise."""
    r, g, b = (np.nan_to_num(rgb[i].astype(np.float32), nan=0.0) for i in range(3))
    s = r + g + b + 1e-3
    exg = (2 * g - r - b) / s
    bright = s / (3 * 255)
    base = np.full(r.shape, M.PAVEMENT, dtype=np.uint8)
    base[(exg > 0.045) & (bright > 0.12)] = M.GRASS
    base[(exg <= 0.045) & (bright < 0.30)] = M.ROAD
    base[np.isnan(rgb[0])] = M.GRASS
    base = majority_filter(base, [M.PAVEMENT, M.GRASS, M.ROAD], 5)
    return remove_small_regions(base, 24)


def classify(
    bounds: tuple[float, float, float, float],
    res: float,
    ortho_rgb: np.ndarray,
    points: list[Feature],
    lines: list[Feature],
    polygons: list[Feature],
) -> Landcover:
    w, s, e, n = bounds
    cols = int(round((e - w) / res))
    rows = int(round((n - s) / res))
    transform = from_origin(w, n, res, res)
    cls = _ortho_base(ortho_rgb)
    assert cls.shape == (rows, cols), (cls.shape, rows, cols)

    def paint(shapes_values: list[tuple[shapely.Geometry, int]], target: np.ndarray, all_touched=False):
        if not shapes_values:
            return
        rasterize(shapes_values, out=target, transform=transform, all_touched=all_touched)

    # --- areas -----------------------------------------------------------------
    areas: list[tuple[int, shapely.Geometry, int]] = []
    leaf_shapes: list[tuple[shapely.Geometry, int]] = []
    bshapes: list[tuple[shapely.Geometry, int]] = []
    for f in polygons:
        if f.get("building") and f.get("building") != "no":
            if f.get("location") not in ("underground",):
                bshapes.append((f.geom, 1))
            continue
        if _layer(f) < 0 or _is_true(f.get("tunnel")):
            continue
        ac = _area_class(f)
        if ac is not None:
            areas.append((ac[0], f.geom, ac[1]))
        if ac is not None and ac[1] == M.FOREST and _leaf(f):
            leaf_shapes.append((f.geom, _leaf(f)))
    areas.sort(key=lambda t: t[0])
    paint([(g, v) for _, g, v in areas if v != M.WATER], cls)

    # --- lines -----------------------------------------------------------------
    bridges: list[Bridge] = []
    line_shapes: list[tuple[float, shapely.Geometry, int]] = []
    for f in lines:
        if _is_true(f.get("tunnel")) or _is_true(f.get("covered")) or _layer(f) < 0:
            continue
        g = f.geom
        rc = road_class(f)
        if rc is not None:
            mat, width = rc
            if _is_true(f.get("bridge")):
                bridges.append(Bridge(g.buffer(width / 2, cap_style="flat"), g, mat, max(1, _layer(f))))
                continue
            prio = 30 + (10 if mat in (M.ROAD, M.ROAD_MAJOR, M.CYCLEWAY) else 0) + (5 if mat == M.ROAD_MAJOR else 0)
            line_shapes.append((prio, g.buffer(width / 2, cap_style="round", quad_segs=2), mat))
            continue
        rw = f.get("railway")
        if rw in ("rail", "light_rail", "narrow_gauge", "funicular", "tram") and f.get("service") not in ("yard_x",):
            if rw == "tram":
                continue  # street-running track: keep the road surface
            if _is_true(f.get("bridge")):
                bridges.append(Bridge(g.buffer(2.5, cap_style="flat"), g, M.RAIL, max(1, _layer(f))))
                continue
            line_shapes.append((50, g.buffer(2.0, cap_style="flat"), M.RAIL))
            continue
        ww = f.get("waterway")
        if ww in ("river", "stream", "canal", "ditch", "drain"):
            if _is_true(f.get("tunnel")) or f.get("tunnel") == "culvert":
                continue
            width = _width(f, {"river": 8.0, "canal": 6.0, "stream": 2.0}.get(ww, 1.5))
            line_shapes.append((70, g.buffer(width / 2, cap_style="round", quad_segs=2), M.WATER))
    line_shapes.sort(key=lambda t: t[0])
    # roads first, then water areas on top of roads (lake shore), then rivers
    paint([(g, v) for p, g, v in line_shapes if v != M.WATER], cls, all_touched=False)
    paint([(g, v) for _, g, v in areas if v == M.WATER], cls)
    paint([(g, v) for p, g, v in line_shapes if v == M.WATER], cls)

    cls = remove_small_regions(cls, 6)

    leaf = np.zeros((rows, cols), dtype=np.uint8)
    if leaf_shapes:
        rasterize(leaf_shapes, out=leaf, transform=transform)
    obuild = np.zeros((rows, cols), dtype=np.uint8)
    if bshapes:
        rasterize(bshapes, out=obuild, transform=transform)
    return Landcover(cls=cls, leaf=leaf, osm_buildings=obuild.astype(bool), bridges=bridges)
