"""Elevation sources.

* swissALTI3D 2 m (terrain without buildings/vegetation) - ground surface.
* swissSURFACE3D raster (surface incl. buildings/vegetation) - read at 1 m from
  the remote cloud-optimised GeoTIFF overviews; used for tree heights and
  bridge decks.
* swissALTIRegio 10 m (Switzerland + neighbouring France) - horizon backdrop,
  read directly from the national COG with HTTP range requests.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.windows import from_bounds

from . import config
from .download import fetch
from .log import log
from .raster_io import RasterSource, index_sources
from .stac import newest_assets

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")


def ensure_alti3d(bbox: tuple[float, float, float, float], cache: Path) -> tuple[list[RasterSource], list[str]]:
    suffix = f"_{config.ALTI3D_RESOLUTION}_2056_5728.tif"
    assets = newest_assets(config.COLLECTION_ALTI3D, bbox, suffix)
    log(f"swissALTI3D: {len(assets)} tiles")
    paths = [fetch(a.href, cache / "alti3d" / a.key, a.checksum) for a in assets]
    return index_sources(paths), sorted({a.item_id.split("_")[1] for a in assets})


def ensure_surface3d(bbox: tuple[float, float, float, float], cache: Path) -> tuple[list[RasterSource], list[str]]:
    """Digital surface model resampled to 1 m (from the COG's first overview)."""
    suffix = f"_{config.SURFACE3D_RESOLUTION}_2056_5728.tif"
    assets = newest_assets(config.COLLECTION_SURFACE3D, bbox, suffix)
    log(f"swissSURFACE3D: {len(assets)} tiles")
    out_dir = cache / "surface3d_1m"
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for a in assets:
        dest = out_dir / a.key.replace("_0.5_", "_1_")
        if not dest.exists():
            log(f"  surface {a.key} @1m")
            with rasterio.open("/vsicurl/" + a.href) as ds:
                h, w = ds.height // 2, ds.width // 2
                data = ds.read(1, out_shape=(h, w), resampling=Resampling.average)
                profile = ds.profile.copy()
                profile.update(
                    width=w,
                    height=h,
                    transform=ds.transform * ds.transform.scale(2, 2),
                    compress="deflate",
                    predictor=3,
                    tiled=True,
                    blockxsize=256,
                    blockysize=256,
                )
                profile.pop("interleave", None)
                tmp = dest.with_suffix(".part.tif")
                with rasterio.open(tmp, "w", **profile) as dst:
                    dst.write(data, 1)
                tmp.replace(dest)
        paths.append(dest)
    return index_sources(paths), sorted({a.item_id.split("_")[1] for a in assets})


def read_regio(bounds: tuple[float, float, float, float], resolution: float) -> np.ndarray:
    """Read swissALTIRegio over ``bounds`` at ``resolution`` metres (uses overviews)."""
    w, s, e, n = bounds
    cols = int(round((e - w) / resolution))
    rows = int(round((n - s) / resolution))
    with rasterio.open("/vsicurl/" + config.SWISSALTIREGIO_COG) as ds:
        win = from_bounds(w, s, e, n, ds.transform)
        data = ds.read(
            1,
            window=win,
            out_shape=(rows, cols),
            resampling=Resampling.average,
            boundless=True,
            fill_value=np.nan,
            masked=False,
        ).astype("float32")
        nodata = ds.nodata
    if nodata is not None:
        data[data >= nodata * 0.999] = np.nan
    data[data > 10_000] = np.nan
    return data


def regio_transform(bounds: tuple[float, float, float, float], resolution: float):
    return from_origin(bounds[0], bounds[3], resolution, resolution)
