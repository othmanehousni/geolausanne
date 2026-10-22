"""World manifest: everything the web client needs to stream the city.

The schema is mirrored by ``packages/geo-types/src/manifest.ts``; bump
``FORMAT_VERSION`` on any breaking change.

Version 2 (colour model of docs/decisions/0025): vertex colours are sRGB
albedos and the alpha byte packs class, variant and ambient occlusion
(docs/pipeline/materials.md#the-shader-byte). Clients that read version 2
also read version 1 tiles (variant and occlusion bits are simply zero).
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer

from . import config

FORMAT_VERSION = 2

SOURCES = [
    {
        "id": "swissALTI3D",
        "name": "swissALTI3D (2 m)",
        "provider": "Federal Office of Topography swisstopo",
        "license": "Open Government Data (free use, attribution required)",
        "url": "https://www.swisstopo.admin.ch/en/height-model-swissalti3d",
    },
    {
        "id": "swissBUILDINGS3D",
        "name": "swissBUILDINGS3D 3.0 Beta",
        "provider": "Federal Office of Topography swisstopo",
        "license": "Open Government Data (free use, attribution required)",
        "url": "https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta",
    },
    {
        "id": "swissSURFACE3D",
        "name": "swissSURFACE3D Raster",
        "provider": "Federal Office of Topography swisstopo",
        "license": "Open Government Data (free use, attribution required)",
        "url": "https://www.swisstopo.admin.ch/en/height-model-swisssurface3d-raster",
    },
    {
        "id": "SWISSIMAGE",
        "name": "SWISSIMAGE 10 cm (2 m product; 0.4 m overview for roofs)",
        "provider": "Federal Office of Topography swisstopo",
        "license": "Open Government Data (free use, attribution required)",
        "url": "https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10",
    },
    {
        "id": "GWR",
        "name": "Federal Register of Buildings and Dwellings (GWR / RegBL)",
        "provider": "Federal Statistical Office FSO",
        "license": "Free use, source required",
        "url": "https://www.housing-stat.ch/",
    },
    {
        "id": "swissBOUNDARIES3D",
        "name": "swissBOUNDARIES3D",
        "provider": "Federal Office of Topography swisstopo",
        "license": "Open Government Data (free use, attribution required)",
        "url": "https://www.swisstopo.admin.ch/en/landscape-model-swissboundaries3d",
    },
    {
        "id": "swissALTIRegio",
        "name": "swissALTIRegio (10 m, horizon)",
        "provider": "Federal Office of Topography swisstopo",
        "license": "Open Government Data (free use, attribution required)",
        "url": "https://www.swisstopo.admin.ch/en/height-model-swissaltiregio",
    },
    {
        "id": "OpenStreetMap",
        "name": "OpenStreetMap",
        "provider": "OpenStreetMap contributors",
        "license": "ODbL 1.0",
        "url": "https://www.openstreetmap.org/copyright",
    },
]

ATTRIBUTION = "Geodata © swisstopo · Building register © FSO (GWR) · Map data © OpenStreetMap contributors (ODbL)"


def content_version(tiles: list, editions: dict, horizon: bytes | None = None) -> str:
    """The build's cache key (12 hex digits of SHA-256): the tile table, the
    dataset editions and, once it is built, the horizon. Every file is
    requested with ``?v=<version>`` and cached for a year, so any change to
    what is served must change it."""
    h = hashlib.sha256((json.dumps(tiles, separators=(",", ":")) + json.dumps(editions, sort_keys=True, default=str)).encode())
    if horizon is not None:
        h.update(hashlib.sha256(horizon).digest())
    return h.hexdigest()[:12]


def _wgs84_bounds(b):
    t = Transformer.from_crs(2056, 4326, always_xy=True)
    xs, ys = t.transform([b[0], b[2], b[0], b[2]], [b[1], b[1], b[3], b[3]])
    return [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)]


def write_manifest(
    out_dir: Path,
    area: config.AreaSpec,
    entries: list[dict],
    editions: dict,
    horizon: dict | None = None,
    colours: dict | None = None,
) -> dict:
    entries = sorted(entries, key=lambda t: (-t["level"], t["j"], t["i"]))
    tiles = [[t["level"], t["i"], t["j"], t["minY"], t["maxY"], t["bytes"]] for t in entries]
    stats: dict[str, dict] = {}
    for t in entries:
        s = stats.setdefault(str(t["level"]), {"tiles": 0, "empty": 0, "bytes": 0, "quads": 0, "instances": 0})
        s["tiles"] += 1
        s["empty"] += 1 if t.get("empty") else 0
        s["bytes"] += t["bytes"]
        s["quads"] += t["quads"]
        s["instances"] += t["instances"]
    roots = [t for t in entries if t["level"] == config.ROOT_LEVEL]
    rs = config.LODS[config.ROOT_LEVEL].tile_size
    lv95 = [
        config.ORIGIN_E + min(t["i"] for t in roots) * rs,
        config.ORIGIN_N + min(t["j"] for t in roots) * rs,
        config.ORIGIN_E + (max(t["i"] for t in roots) + 1) * rs,
        config.ORIGIN_N + (max(t["j"] for t in roots) + 1) * rs,
    ] if roots else list(area.coarse_bbox)
    manifest = {
        "format": "geolausanne-voxel-city",
        "formatVersion": FORMAT_VERSION,
        "city": "lausanne",
        "area": area.name,
        "version": content_version(tiles, editions),
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "crs": "EPSG:2056",
        "heightReference": "LN02",
        "origin": {"easting": config.ORIGIN_E, "northing": config.ORIGIN_N, "elevation": config.ORIGIN_H},
        "axes": {"x": "east", "y": "up", "z": "south"},
        "tileVoxels": config.TILE_VOXELS,
        "rootLevel": config.ROOT_LEVEL,
        "lods": [{"level": l.level, "voxelSize": l.voxel_size, "tileSize": l.tile_size} for l in config.LODS],
        "lakeLevel": config.LAKE_LEVEL,
        "bounds": {"lv95": lv95, "wgs84": _wgs84_bounds(lv95)},
        "tileFields": ["level", "i", "j", "minY", "maxY", "bytes"],
        "tiles": tiles,
        "horizon": horizon,
        "stats": stats,
        "editions": editions,
        "sources": SOURCES,
        "attribution": ATTRIBUTION,
    }
    if colours:
        # how the buildings were coloured: roof families, facade palettes,
        # how many roofs had photo pixels and how many matched the register
        manifest["colours"] = colours
    (out_dir / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":"), default=str))
    return manifest
