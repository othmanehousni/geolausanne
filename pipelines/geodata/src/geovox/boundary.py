"""Municipality boundaries from swissBOUNDARIES3D (they choose the detailed tiles).

Areas name their municipalities; the BFS numbers are looked up **by name** in
the GeoPackage's ``tlm_hoheitsgebiet`` layer rather than typed from memory.
Official names carry a canton suffix where another canton has a homonym
(``Ecublens (VD)``, ``Renens (VD)``, ``Saint-Sulpice (VD)``): a name without
the suffix still matches when it is unambiguous within the canton.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pyogrio
import shapely

from . import config
from .download import fetch
from .log import log
from .stac import search_items

LAYER = "tlm_hoheitsgebiet"


@dataclass(frozen=True)
class Municipality:
    name: str  # official name
    bfs: int


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


def _fold(name: str) -> str:
    """Case-, accent- and punctuation-insensitive form of a name."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


_SUFFIX = re.compile(r"\s*\([A-Z]{2}\)$")


def match_municipalities(rows: list[tuple[str, int]], wanted: list[str] | tuple[str, ...]) -> list[Municipality]:
    """Match ``wanted`` names against ``(official name, bfs)`` rows of one canton.

    Exact official names win; otherwise the comparison ignores case, accents,
    punctuation and a trailing canton suffix such as ``(VD)``. Unknown or
    ambiguous names raise ``ValueError`` (with the closest official names).
    """
    exact: dict[str, set[int]] = {}
    loose: dict[str, set[tuple[str, int]]] = {}
    for name, bfs in rows:
        exact.setdefault(name, set()).add(int(bfs))
        loose.setdefault(_fold(_SUFFIX.sub("", name)), set()).add((name, int(bfs)))
    out: list[Municipality] = []
    for want in wanted:
        if want in exact:
            numbers = exact[want]
            if len(numbers) != 1:
                raise ValueError(f"municipality name {want!r} has several BFS numbers: {sorted(numbers)}")
            out.append(Municipality(want, next(iter(numbers))))
            continue
        cands = loose.get(_fold(_SUFFIX.sub("", want)), set())
        if len({b for _n, b in cands}) == 1:
            name, bfs = sorted(cands)[0]
            out.append(Municipality(name, bfs))
            continue
        if cands:
            raise ValueError(f"municipality name {want!r} is ambiguous: {sorted(cands)}")
        close = difflib.get_close_matches(want, sorted(exact), n=4, cutoff=0.6)
        raise ValueError(f"municipality {want!r} not found (closest: {close})")
    return out


def resolve_municipalities(gpkg: Path, names: tuple[str, ...], canton: int = 22) -> list[Municipality]:
    """BFS numbers of ``names`` in ``canton``, read from the boundaries GeoPackage."""
    meta, _fids, _geoms, fields = pyogrio.raw.read(
        gpkg, layer=LAYER, where=f"kantonsnummer = {int(canton)}", read_geometry=False, columns=["name", "bfs_nummer"]
    )
    cols = list(meta["fields"])
    rows = list(zip((str(n) for n in fields[cols.index("name")]), (int(b) for b in fields[cols.index("bfs_nummer")])))
    return match_municipalities(rows, names)


def municipality(gpkg: Path, bfs: int) -> shapely.Geometry:
    _meta, _fids, geoms, _fields = pyogrio.raw.read(gpkg, layer=LAYER, where=f"bfs_nummer = {int(bfs)}")
    polys = [shapely.force_2d(shapely.from_wkb(g)) for g in geoms if g is not None]
    if not polys:
        raise RuntimeError(f"municipality {bfs} not found")
    return shapely.union_all(polys)


def municipalities_union(gpkg: Path, numbers: list[int]) -> shapely.Geometry:
    """Union of several municipalities (shared borders dissolve)."""
    return shapely.union_all([municipality(gpkg, b) for b in numbers])
