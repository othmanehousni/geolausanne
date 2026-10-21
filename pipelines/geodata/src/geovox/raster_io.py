"""Read arbitrary LV95 windows from a set of tiled rasters at any resolution."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject


@dataclass(frozen=True)
class RasterSource:
    path: Path
    bounds: tuple[float, float, float, float]  # west, south, east, north


def index_sources(paths: list[Path]) -> list[RasterSource]:
    out = []
    for p in paths:
        with rasterio.open(p) as ds:
            b = ds.bounds
            out.append(RasterSource(p, (b.left, b.bottom, b.right, b.top)))
    return out


def _intersects(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def read_window(
    sources: list[RasterSource],
    bounds: tuple[float, float, float, float],
    resolution: float,
    *,
    bands: int | list[int] = 1,
    resampling: Resampling = Resampling.bilinear,
    dtype: str = "float32",
    fill: float = np.nan,
) -> np.ndarray:
    """Mosaic ``sources`` into a north-up array covering ``bounds``.

    The returned array has shape ``(rows, cols)`` (or ``(bands, rows, cols)``
    when ``bands`` is a list) with row 0 at the northern edge; cell ``(r, c)``
    is centred on ``(west + (c + .5) res, north - (r + .5) res)``.
    """
    w, s, e, n = bounds
    cols = int(round((e - w) / resolution))
    rows = int(round((n - s) / resolution))
    band_list = [bands] if isinstance(bands, int) else list(bands)
    dst = np.full((len(band_list), rows, cols), fill, dtype=dtype)
    dst_transform = from_origin(w, n, resolution, resolution)
    for src in sources:
        if not _intersects(src.bounds, bounds):
            continue
        with rasterio.open(src.path) as ds:
            for bi, b in enumerate(band_list):
                tmp = np.full((rows, cols), fill, dtype=dtype)
                reproject(
                    source=rasterio.band(ds, b),
                    destination=tmp,
                    src_transform=ds.transform,
                    src_crs=ds.crs,
                    src_nodata=ds.nodata,
                    dst_transform=dst_transform,
                    dst_crs=ds.crs,
                    dst_nodata=fill,
                    resampling=resampling,
                )
                valid = ~np.isnan(tmp) if np.isnan(fill) else tmp != fill
                dst[bi][valid] = tmp[valid]
    return dst[0] if isinstance(bands, int) else dst


def fill_gaps(a: np.ndarray, default: float) -> np.ndarray:
    """Replace NaNs by the nearest valid value (or ``default`` if none)."""
    mask = np.isnan(a)
    if not mask.any():
        return a
    if mask.all():
        return np.full_like(a, default)
    from scipy import ndimage

    idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
    return a[tuple(idx)]
