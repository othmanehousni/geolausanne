"""SWISSIMAGE orthophotos (2 m product) used to colour roofs and to tell grass
from paved ground where OpenStreetMap has no land-use information."""

from __future__ import annotations

from pathlib import Path

from . import config
from .download import fetch
from .log import log
from .raster_io import RasterSource, index_sources
from .stac import newest_assets


def ensure_swissimage(bbox: tuple[float, float, float, float], cache: Path) -> tuple[list[RasterSource], list[str]]:
    suffix = f"_{config.SWISSIMAGE_RESOLUTION}_2056.tif"
    assets = newest_assets(config.COLLECTION_SWISSIMAGE, bbox, suffix)
    log(f"SWISSIMAGE: {len(assets)} tiles")
    paths = [fetch(a.href, cache / "swissimage" / a.key, a.checksum) for a in assets]
    return index_sources(paths), sorted({a.item_id.split("_")[1] for a in assets})
