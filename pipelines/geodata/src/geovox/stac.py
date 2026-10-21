"""Minimal client for the swisstopo STAC API (https://data.geo.admin.ch/api/stac/v1).

Only the subset needed by the pipeline is implemented: paginated item search by
bounding box and selection of the newest edition per map tile.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from dataclasses import dataclass

from pyproj import Transformer

from . import config
from .download import open_url

_TO_WGS84 = Transformer.from_crs(2056, 4326, always_xy=True)


@dataclass(frozen=True)
class StacAsset:
    item_id: str
    key: str
    href: str
    datetime: str
    checksum: str | None  # multihash hex ("1220" + sha256)


def lv95_bbox_to_wgs84(bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    w, s, e, n = bbox
    xs, ys = _TO_WGS84.transform([w, e, w, e], [s, s, n, n])
    return (min(xs), min(ys), max(xs), max(ys))


def search_items(collection: str, bbox_lv95: tuple[float, float, float, float]) -> list[dict]:
    lon0, lat0, lon1, lat1 = lv95_bbox_to_wgs84(bbox_lv95)
    params = urllib.parse.urlencode(
        {"bbox": f"{lon0:.7f},{lat0:.7f},{lon1:.7f},{lat1:.7f}", "limit": 100}
    )
    url: str | None = f"{config.STAC_ROOT}/collections/{collection}/items?{params}"
    items: list[dict] = []
    while url:
        with open_url(url) as resp:
            page = json.load(resp)
        items.extend(page.get("features", []))
        url = next((l["href"] for l in page.get("links", []) if l.get("rel") == "next"), None)
    return items


_TILE_RE = re.compile(r"_(\d{4}-\d{4}|\d{4}-\d{2})(?:_|$)")


def tile_code(item_id: str) -> str | None:
    """Map-tile code of an item id, e.g. ``2537-1152`` or ``1243-14``."""
    m = _TILE_RE.search(item_id)
    return m.group(1) if m else None


def newest_assets(
    collection: str,
    bbox_lv95: tuple[float, float, float, float],
    asset_suffix: str,
    exclude_editions: tuple[str, ...] = (),
) -> list[StacAsset]:
    """For each map tile intersecting ``bbox``, return the newest asset whose key
    ends with ``asset_suffix`` (e.g. ``"_2_2056_5728.tif"``)."""
    best: dict[str, StacAsset] = {}
    for item in search_items(collection, bbox_lv95):
        code = tile_code(item["id"])
        if code is None:  # national mosaics (e.g. whole-Switzerland GDBs)
            continue
        if any(ed in item["id"] for ed in exclude_editions):
            continue
        for key, asset in item["assets"].items():
            if not key.endswith(asset_suffix):
                continue
            cand = StacAsset(
                item_id=item["id"],
                key=key,
                href=asset["href"],
                datetime=item["properties"].get("datetime") or "",
                checksum=asset.get("file:checksum"),
            )
            cur = best.get(code)
            if cur is None or cand.datetime > cur.datetime:
                best[code] = cand
    return [best[k] for k in sorted(best)]
