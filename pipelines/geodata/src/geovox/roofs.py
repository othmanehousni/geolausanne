"""Roof colours from the 10 cm orthophoto (SWISSIMAGE), read at 0.4 m.

The 10 cm sheets are cloud-optimised GeoTIFFs (JPEG, 256 px tiles) with
internal overviews at 0.2, 0.4, 0.8 ... m. :func:`ensure_roof_imagery` reads
the 0.4 m overview of every 1 km sheet with HTTP range requests (no full
download) and caches it as a small JPEG GeoTIFF (~2 MB per sheet).

Per building, :func:`roof_samples` rasterises the upward-facing roof
triangles at 0.4 m, drops the edge pixels (walls and pavement leak in
because the orthophoto is not a true orthophoto), then estimates a robust
colour: vegetation pixels (overhanging trees) and shadows are left out and
the median CIELAB of the brighter part is kept, because the sunlit faces of
a pitched roof carry its colour. The shares of vegetation and of
solar-panel-like pixels are reported too (green roofs, PV arrays).
"""

from __future__ import annotations

import math
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from numba import njit
from rasterio.windows import Window

from . import config
from .log import log
from .materials import RoofSample, srgb_to_lab
from .raster_io import RasterSource, index_sources
from .stac import newest_assets

# fewer, merged range requests: a whole 0.4 m overview in well under a second
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")


def _fetch_overview(href: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    with rasterio.open("/vsicurl/" + href, overview_level=config.ROOF_IMAGE_OVERVIEW) as ds:
        data = ds.read()
        profile = ds.profile.copy()
    profile.update(
        driver="GTiff", compress="jpeg", photometric="ycbcr", jpeg_quality=90,
        tiled=True, blockxsize=256, blockysize=256,
    )
    tmp = dest.with_suffix(".part.tif")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(data)
    tmp.replace(dest)
    return dest


def ensure_roof_imagery(bbox: tuple[float, float, float, float], cache: Path) -> tuple[list[RasterSource], list[str]]:
    """The 0.4 m overview of the newest SWISSIMAGE 10 cm sheet of every 1 km
    tile in ``bbox``, cached locally."""
    assets = newest_assets(config.COLLECTION_SWISSIMAGE, bbox, "_0.1_2056.tif")
    res = config.ROOF_IMAGE_RESOLUTION
    out_dir = cache / f"swissimage_{res:g}m"
    out_dir.mkdir(parents=True, exist_ok=True)
    todo = [(a.href, out_dir / a.key.replace("_0.1_", f"_{res:g}_")) for a in assets]
    missing = sum(1 for _h, d in todo if not d.exists())
    log(f"SWISSIMAGE 10 cm at {res:g} m: {len(assets)} sheets ({missing} to read)")
    with ThreadPoolExecutor(max_workers=6) as ex:
        paths = list(ex.map(lambda t: _fetch_overview(*t), todo))
    return index_sources(paths), sorted({a.item_id.split("_")[1] for a in assets})


def read_rgb(sources: list[RasterSource], bounds: tuple[float, float, float, float], res: float) -> np.ndarray:
    """``(rows, cols, 3)`` uint8 mosaic of ``bounds`` (0 where no sheet).

    Block bounds sit on the 0.4 m grid of the sheets (whole metres from
    kilometre corners), so windows are read directly without resampling.
    """
    w, s, e, n = bounds
    cols = int(round((e - w) / res))
    rows = int(round((n - s) / res))
    out = np.zeros((rows, cols, 3), dtype=np.uint8)
    for src in sources:
        sw, ss, se, sn = src.bounds
        iw, is_, ie, in_ = max(w, sw), max(s, ss), min(e, se), min(n, sn)
        if iw >= ie or is_ >= in_:
            continue
        with rasterio.open(src.path) as ds:
            px = ds.transform.a
            c0 = int(round((iw - sw) / px))
            r0 = int(round((sn - in_) / px))
            wc = int(round((ie - iw) / px))
            hr = int(round((in_ - is_) / px))
            if abs(px - res) > 1e-6:
                data = ds.read([1, 2, 3], window=Window(c0, r0, wc, hr),
                               out_shape=(3, int(round((in_ - is_) / res)), int(round((ie - iw) / res))))
            else:
                data = ds.read([1, 2, 3], window=Window(c0, r0, wc, hr))
        dc = int(round((iw - w) / res))
        dr = int(round((n - in_) / res))
        h, wd = data.shape[1], data.shape[2]
        out[dr : dr + h, dc : dc + wd] = np.moveaxis(data, 0, -1)[: rows - dr, : cols - dc]
    return out


@njit(cache=True)
def rasterize_labels(tris, labels, value):
    """Write ``value`` into the cells of ``labels`` whose centre lies inside
    a triangle; ``tris`` is ``(n, 3, 2)`` in (column, row) cell units."""
    rows, cols = labels.shape
    for t in range(tris.shape[0]):
        ax, ay = tris[t, 0, 0], tris[t, 0, 1]
        bx, by = tris[t, 1, 0], tris[t, 1, 1]
        cx, cy = tris[t, 2, 0], tris[t, 2, 1]
        area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(area) < 1e-9:
            continue
        i0 = max(int(math.ceil(min(ax, min(bx, cx)) - 0.5)), 0)
        i1 = min(int(math.floor(max(ax, max(bx, cx)) - 0.5)), cols - 1)
        k0 = max(int(math.ceil(min(ay, min(by, cy)) - 0.5)), 0)
        k1 = min(int(math.floor(max(ay, max(by, cy)) - 0.5)), rows - 1)
        for ci in range(i0, i1 + 1):
            px = ci + 0.5
            for ck in range(k0, k1 + 1):
                py = ck + 0.5
                w0 = (bx - px) * (cy - py) - (cx - px) * (by - py)
                w1 = (cx - px) * (ay - py) - (ax - px) * (cy - py)
                w2 = (ax - px) * (by - py) - (bx - px) * (ay - py)
                if (w0 >= 0 and w1 >= 0 and w2 >= 0) or (w0 <= 0 and w1 <= 0 and w2 <= 0):
                    labels[ck, ci] = value


def robust_sample(rgb: np.ndarray) -> RoofSample | None:
    """Robust roof colour of ``(n, 3)`` sRGB pixels (see the module doc)."""
    n = len(rgb)
    if n < 8:
        return None
    px = rgb.astype(np.float32)
    lab = srgb_to_lab(px)
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    exg = (2 * g - r - b) / (r + g + b + 1e-3)
    veg = (exg > 0.06) & (lab[:, 1] < -3.0)
    green = float(veg.mean())
    solar = float(((lab[:, 0] < 42.0) & (lab[:, 2] < -2.5)).mean())
    keep = ~veg if green < 0.5 else veg  # a green roof is the majority, trees a minority
    keep &= lab[:, 0] > 22.0  # deep shadows
    if keep.sum() < 6:
        keep = np.ones(n, dtype=bool)
    sel = lab[keep]
    # the brighter part: sunlit faces carry the colour, shaded faces grey it
    sel = sel[sel[:, 0] >= np.percentile(sel[:, 0], 40)]
    L, a, bb = np.median(sel, axis=0)
    return RoofSample(float(L), float(a), float(bb), n, green, solar)


def roof_samples(
    rgb: np.ndarray,
    bounds: tuple[float, float, float, float],
    res: float,
    roofs: list[np.ndarray],
    heights: np.ndarray,
) -> list[RoofSample | None]:
    """One sample per building.

    ``roofs[i]`` holds building i's upward roof triangles as ``(n, 3, 2)``
    LV95 (E, N); ``heights`` orders the rasterisation so that taller roofs
    win where roofs overlap, as in the photo.
    """
    w, _s, _e, n = bounds
    rows, cols = rgb.shape[:2]
    labels = np.zeros((rows, cols), dtype=np.int32)
    for bi in np.argsort(heights, kind="stable"):
        tri = roofs[bi]
        if len(tri) == 0:
            continue
        cell = np.empty_like(tri)
        cell[..., 0] = (tri[..., 0] - w) / res
        cell[..., 1] = (n - tri[..., 1]) / res
        rasterize_labels(np.ascontiguousarray(cell, dtype=np.float64), labels, int(bi) + 1)
    # edge pixels: walls and pavement leak in (relief displacement)
    interior = labels.copy()
    interior[1:, :] = np.where(labels[1:, :] == labels[:-1, :], interior[1:, :], 0)
    interior[:-1, :] = np.where(labels[:-1, :] == labels[1:, :], interior[:-1, :], 0)
    interior[:, 1:] = np.where(labels[:, 1:] == labels[:, :-1], interior[:, 1:], 0)
    interior[:, :-1] = np.where(labels[:, :-1] == labels[:, 1:], interior[:, :-1], 0)
    valid = rgb.any(axis=2)
    out: list[RoofSample | None] = [None] * len(roofs)
    for lab_img in (interior, labels):  # small roofs have no interior: fall back to all pixels
        flat = np.where(valid, lab_img, 0).ravel()
        idx = np.flatnonzero(flat)
        if len(idx) == 0:
            continue
        ids = flat[idx]
        order = np.argsort(ids, kind="stable")
        ids = ids[order]
        px = rgb.reshape(-1, 3)[idx[order]]
        starts = np.flatnonzero(np.r_[True, ids[1:] != ids[:-1]])
        ends = np.r_[starts[1:], len(ids)]
        for s0, e0 in zip(starts, ends):
            bi = int(ids[s0]) - 1
            if out[bi] is None and e0 - s0 >= 8:
                out[bi] = robust_sample(px[s0:e0])
    return out
