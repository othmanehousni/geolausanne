"""OpenStreetMap features (roads, rails, water, land use, bridges, trees, POIs).

Data: regional extract of the canton of Vaud (ODbL, (c) OpenStreetMap
contributors). It is clipped with ``osmium extract`` and converted to a
GeoPackage in LV95 with GDAL's OSM driver and our ``osmconf.ini``.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pyogrio
import shapely

from . import config
from .download import fetch
from .log import log
from .stac import lv95_bbox_to_wgs84

OSMCONF = Path(__file__).with_name("osmconf.ini")


@dataclass
class Feature:
    geom: shapely.Geometry
    tags: dict[str, str] = field(default_factory=dict)

    def get(self, key: str, default: str | None = None) -> str | None:
        return self.tags.get(key, default)


def ensure_osm(bbox: tuple[float, float, float, float], cache: Path) -> tuple[Path, str]:
    """Return a GeoPackage (EPSG:2056) with ``points``, ``lines`` and
    ``multipolygons`` layers covering ``bbox`` and the extract's timestamp."""
    pbf = fetch(config.OSM_EXTRACT_URL, cache / "osm" / "vaud-latest.osm.pbf")
    lon0, lat0, lon1, lat1 = lv95_bbox_to_wgs84(bbox)
    key = f"{lon0:.4f}_{lat0:.4f}_{lon1:.4f}_{lat1:.4f}"
    clip = cache / "osm" / f"clip_{key}.osm.pbf"
    gpkg = cache / "osm" / f"clip_{key}.gpkg"
    if not clip.exists():
        log("osmium extract")
        subprocess.run(
            [
                "osmium", "extract",
                "-b", f"{lon0:.6f},{lat0:.6f},{lon1:.6f},{lat1:.6f}",
                "--strategy", "smart",
                "-o", str(clip), "--overwrite", str(pbf),
            ],
            check=True,
            capture_output=True,
        )
    if not gpkg.exists():
        env = dict(os.environ, OSM_CONFIG_FILE=str(OSMCONF), OGR_INTERLEAVED_READING="YES")
        tmp = gpkg.with_suffix(".part.gpkg")
        if tmp.exists():
            tmp.unlink()
        for layer in ("points", "lines", "multipolygons"):
            log(f"ogr2ogr osm {layer}")
            subprocess.run(
                [
                    "ogr2ogr", "-f", "GPKG",
                    "-append" if tmp.exists() else "-overwrite",
                    str(tmp), str(clip), layer,
                    "-t_srs", "EPSG:2056",
                    "-nln", layer,
                    "-skipfailures",
                ],
                check=True,
                capture_output=True,
                env=env,
            )
        tmp.replace(gpkg)
    timestamp = ""
    try:
        out = subprocess.run(
            ["osmium", "fileinfo", "-g", "header.option.osmosis_replication_timestamp", str(pbf)],
            check=True, capture_output=True, text=True,
        )
        timestamp = out.stdout.strip()
    except subprocess.CalledProcessError:
        pass
    return gpkg, timestamp


def read_features(gpkg: Path, layer: str, bbox: tuple[float, float, float, float]) -> list[Feature]:
    meta, _fids, geoms, fields = pyogrio.raw.read(gpkg, layer=layer, bbox=bbox)
    names = list(meta["fields"])
    out: list[Feature] = []
    shp = shapely.from_wkb([g if g is not None else None for g in geoms])
    for idx, geom in enumerate(shp):
        if geom is None or geom.is_empty:
            continue
        tags: dict[str, str] = {}
        for ci, name in enumerate(names):
            v = fields[ci][idx]
            if v is None or (isinstance(v, float) and np.isnan(v)):
                continue
            if name == "other_tags":
                try:
                    tags.update({k: str(val) for k, val in json.loads(v).items()})
                except (TypeError, ValueError):
                    pass
            elif name != "osm_way_id":
                tags[name] = str(v)
        if "osm_way_id" in names:
            v = fields[names.index("osm_way_id")][idx]
            if v:
                tags.setdefault("osm_id", f"w{v}")
        out.append(Feature(geom, tags))
    return out
