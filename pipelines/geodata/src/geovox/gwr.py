"""Federal Register of Buildings and Dwellings (GWR / RegBL), public extract.

The Federal Statistical Office publishes the register's public part every
day, per canton (https://public.madd.bfs.admin.ch/vd.zip for Vaud: 84 MB).
Free use, the source must be named ("Office fédéral de la statistique,
Registre fédéral des bâtiments et des logements").

Only what facades need is kept, in a compact table cached next to the
download: coordinates (GKODE/GKODN, LV95), construction year (GBAUJ) or
period (GBAUP), category (GKAT), class (GKLAS), floors (GASTW) and ground
area (GAREA) of existing buildings. swissBUILDINGS3D carries no EGID in
Vaud, so register points are joined to building solids spatially: the
footprint cell under the point, else the nearest footprint within 3 m.
"""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config
from .download import fetch
from .log import log
from .materials import PERIOD_YEAR, GwrInfo

_CSV = "gebaeude_batiment_edificio.csv"
_STATUS_KEEP = {1003, 1004}  # under construction, existing
_FIELDS = ("e", "n", "year", "klass", "category", "floors", "area")


@dataclass
class GwrTable:
    e: np.ndarray
    n: np.ndarray
    year: np.ndarray  # int32, 0 = unknown
    klass: np.ndarray  # int32, 0 = unknown
    category: np.ndarray
    floors: np.ndarray
    area: np.ndarray  # m2, 0 = unknown

    def __len__(self) -> int:
        return len(self.e)

    def subset(self, mask: np.ndarray) -> "GwrTable":
        return GwrTable(*(getattr(self, f)[mask] for f in _FIELDS))


def _int(v: str) -> int:
    try:
        return int(float(v)) if v else 0
    except ValueError:
        return 0


def parse_buildings_csv(text: io.TextIOBase) -> tuple[GwrTable, str]:
    """Parse the register's building table (tab separated) -> table, export date."""
    reader = csv.reader(text, delimiter="\t")
    header = next(reader)
    col = {k: i for i, k in enumerate(header)}
    cols = {k: [] for k in _FIELDS}
    exported = ""
    for row in reader:
        if len(row) < len(header):
            continue
        if _int(row[col["GSTAT"]]) not in _STATUS_KEEP:
            continue
        try:
            e = float(row[col["GKODE"]])
            n = float(row[col["GKODN"]])
        except ValueError:
            continue
        year = _int(row[col["GBAUJ"]])
        if not 1000 <= year <= 2100:
            year = PERIOD_YEAR.get(_int(row[col["GBAUP"]]), 0)
        cols["e"].append(e)
        cols["n"].append(n)
        cols["year"].append(year)
        cols["klass"].append(_int(row[col["GKLAS"]]))
        cols["category"].append(_int(row[col["GKAT"]]))
        cols["floors"].append(_int(row[col["GASTW"]]))
        cols["area"].append(_int(row[col["GAREA"]]))
        if "GEXPDAT" in col:
            exported = max(exported, row[col["GEXPDAT"]])
    table = GwrTable(
        np.array(cols["e"], dtype=np.float64),
        np.array(cols["n"], dtype=np.float64),
        *(np.array(cols[k], dtype=np.int32) for k in _FIELDS[2:]),
    )
    return table, exported


def ensure_gwr(cache: Path) -> tuple[Path, str]:
    """Download the Vaud extract once and cache the compact building table."""
    z = fetch(config.GWR_URL, cache / "gwr" / "vd.zip")
    out = cache / "gwr" / "vd_buildings.npz"
    if not out.exists() or out.stat().st_mtime < z.stat().st_mtime:
        log("GWR: parsing the building register")
        with zipfile.ZipFile(z) as zf, zf.open(_CSV) as raw:
            table, exported = parse_buildings_csv(io.TextIOWrapper(raw, encoding="utf-8"))
        tmp = out.with_suffix(".part.npz")
        np.savez_compressed(tmp, exported=np.array(exported), **{k: getattr(table, k) for k in _FIELDS})
        tmp.replace(out)
    with np.load(out) as data:
        exported = str(data["exported"])
    log(f"GWR: register export of {exported}")
    return out, exported


def load_gwr(path: Path, bbox: tuple[float, float, float, float]) -> GwrTable:
    with np.load(path) as data:
        table = GwrTable(*(data[k] for k in _FIELDS))
    w, s, e, n = bbox
    return table.subset((table.e >= w) & (table.e < e) & (table.n >= s) & (table.n < n))


def join_buildings(
    table: GwrTable, labels: np.ndarray, bounds: tuple[float, float, float, float], res: float = 1.0, search: int = 3
) -> dict[int, GwrInfo]:
    """Register entries per building.

    ``labels`` is a north-up raster of building index + 1 (0 = no building)
    over ``bounds``. A point outside every footprint takes the nearest
    footprint cell within ``search`` cells. Where several entries fall on one
    building, the largest (ground area) one describes it.
    """
    w, _s, _e, n = bounds
    rows, cols = labels.shape
    best: dict[int, tuple[int, GwrInfo]] = {}
    offsets = sorted(
        ((dr, dc) for dr in range(-search, search + 1) for dc in range(-search, search + 1) if dr or dc),
        key=lambda t: t[0] * t[0] + t[1] * t[1],
    )
    for k in range(len(table)):
        c = int((table.e[k] - w) / res)
        r = int((n - table.n[k]) / res)
        if not (0 <= r < rows and 0 <= c < cols):
            continue
        lab = int(labels[r, c])
        if lab == 0:
            for dr, dc in offsets:
                rr, cc = r + dr, c + dc
                if 0 <= rr < rows and 0 <= cc < cols and labels[rr, cc]:
                    lab = int(labels[rr, cc])
                    break
        if lab == 0:
            continue
        weight = int(table.area[k]) or 1
        info = GwrInfo(
            year=int(table.year[k]) or None,
            klass=int(table.klass[k]) or None,
            category=int(table.category[k]) or None,
            floors=int(table.floors[k]) or None,
        )
        if lab - 1 not in best or weight > best[lab - 1][0]:
            best[lab - 1] = (weight, info)
    return {bi: info for bi, (_w, info) in best.items()}
