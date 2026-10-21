"""Municipality boundary from swissBOUNDARIES3D (used to choose detailed tiles)."""

from __future__ import annotations

import zipfile
from pathlib import Path

import pyogrio
import shapely

from . import config
from .download import fetch
from .log import log
from .stac import search_items


def ensure_boundaries(cache: Path) -> tuple[Path, str]:
    items = search_items(config.COLLECTION_BOUNDARIES, (2_537_000.0, 1_152_000.0, 2_538_000.0, 1_153_000.0))
    items.sort(key=lambda it: it["properties"].get("datetime") or "", reverse=True)
    for item in items:
        for key, asset in item["assets"].items():
            if key.endswith(".gpkg.zip"):
                z = fetch(asset["href"], cache / "boundaries" / key, asset.get("file:checksum"))
                out = cache / "boundaries" / key.removesuffix(".zip")
                if not out.exists():
                    with zipfile.ZipFile(z) as zf:
                        member = next(m for m in zf.namelist() if m.endswith(".gpkg") and ".." not in m)
                        out.write_bytes(zf.read(member))
                log(f"swissBOUNDARIES3D: {item['id']}")
                return out, item["id"]
    raise RuntimeError("no swissBOUNDARIES3D GeoPackage found")


def municipality(gpkg: Path, bfs: int) -> shapely.Geometry:
    _meta, _fids, geoms, _fields = pyogrio.raw.read(gpkg, layer="tlm_hoheitsgebiet", where=f"bfs_nummer = {int(bfs)}")
    polys = [shapely.force_2d(shapely.from_wkb(g)) for g in geoms if g is not None]
    if not polys:
        raise RuntimeError(f"municipality {bfs} not found")
    return shapely.union_all(polys)
