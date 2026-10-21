"""swissBUILDINGS3D 3.0 (Beta) building solids.

The per-map-sheet File Geodatabases contain a ``Building_solid`` layer whose
MultiPatch geometries are closed triangulated surfaces (read by GDAL as
``TIN Z``). We convert the layer once per sheet into a GeoPackage with
``ogr2ogr`` (GDAL's OpenFileGDB driver) and then parse the triangles straight
from WKB, which avoids GEOS (it cannot represent TINs).
"""

from __future__ import annotations

import shutil
import struct
import subprocess
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pyogrio

from . import config
from .download import fetch
from .log import log
from .stac import newest_assets

FIELDS = ["UUID", "OBJEKTART", "NAME_KOMPLETT", "DACH_MAX", "DACH_MIN", "EGID"]


@dataclass
class Building:
    uuid: str
    objektart: str
    name: str | None
    roof_max: float | None
    triangles: np.ndarray  # (n, 3, 3) float64: E, N, H


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    root = dest.resolve()
    for member in zf.infolist():
        target = (dest / member.filename).resolve()
        if root not in target.parents and target != root:
            raise ValueError(f"unsafe path in archive: {member.filename}")
    zf.extractall(dest)


def ensure_buildings(bbox: tuple[float, float, float, float], cache: Path) -> tuple[list[Path], list[str]]:
    """Download the map sheets covering ``bbox`` and convert each sheet's
    ``Building_solid`` layer to its own GeoPackage (clipped to ``bbox``)."""
    assets = newest_assets(config.COLLECTION_BUILDINGS3D, bbox, ".gdb.zip")
    log(f"swissBUILDINGS3D 3.0: {len(assets)} sheets")
    w, s, e, n = bbox
    out: list[Path] = []
    for a in assets:
        z = fetch(a.href, cache / "buildings" / "zip" / a.key, a.checksum)
        unz = cache / "buildings" / "gdb" / a.key.removesuffix(".zip")
        if not unz.exists():
            tmp = unz.with_name(unz.name + ".part")
            shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True)
            with zipfile.ZipFile(z) as zf:
                _safe_extract(zf, tmp)
            tmp.rename(unz)
        gdb = next(unz.rglob("*.gdb"))
        bkey = f"{int(w)}_{int(s)}_{int(e)}_{int(n)}"
        gpkg = cache / "buildings" / "gpkg" / f"{a.key.removesuffix('.gdb.zip')}_{bkey}.gpkg"
        if not gpkg.exists():
            gpkg.parent.mkdir(parents=True, exist_ok=True)
            log(f"  ogr2ogr {gdb.name}")
            tmp_gpkg = gpkg.with_suffix(".part.gpkg")
            if tmp_gpkg.exists():
                tmp_gpkg.unlink()
            cmd = [
                "ogr2ogr",
                "-f", "GPKG",
                str(tmp_gpkg),
                str(gdb),
                "Building_solid",
                "-nln", "solids",
                "-select", ",".join(FIELDS),
                "-spat", str(w), str(s), str(e), str(n),
                "-nlt", "MULTIPOLYGONZ",
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"ogr2ogr failed for {gdb}: {res.stderr.strip()[-2000:]}")
            tmp_gpkg.replace(gpkg)
        out.append(gpkg)
    return out, sorted({a.item_id for a in assets})


# ---------------------------------------------------------------------------
# WKB parsing (ISO and 25D flavours of TIN / PolyhedralSurface / MultiPolygon)
# ---------------------------------------------------------------------------

_TRIANGLE_RECORD = np.dtype(
    [("bo", "u1"), ("type", "<u4"), ("nrings", "<u4"), ("npts", "<u4"), ("xyz", "<f8", (4, 3))]
)


def _base_type(t: int) -> tuple[int, bool]:
    has_z = bool(t & 0x80000000) or (1000 <= (t & 0xFFFF) < 2000) or (3000 <= (t & 0xFFFF) < 4000)
    base = (t & 0x0FFFFFFF) % 1000
    return base, has_z


def parse_wkb_triangles(wkb: bytes) -> np.ndarray:
    """Return all triangles of a 3D surface geometry as an ``(n, 3, 3)`` array."""
    if len(wkb) >= 9 and wkb[0] == 1:
        t = struct.unpack_from("<I", wkb, 1)[0]
        base, has_z = _base_type(t)
        if base == 16 and has_z:  # TIN Z: fast path, every member is a closed triangle
            n = struct.unpack_from("<I", wkb, 5)[0]
            if len(wkb) == 9 + n * _TRIANGLE_RECORD.itemsize:
                rec = np.frombuffer(wkb, dtype=_TRIANGLE_RECORD, count=n, offset=9)
                if (rec["npts"] == 4).all() and (rec["nrings"] == 1).all():
                    return rec["xyz"][:, :3, :].astype(np.float64)
    tris: list[np.ndarray] = []
    _parse_any(memoryview(wkb), 0, tris)
    if not tris:
        return np.zeros((0, 3, 3))
    return np.concatenate(tris, axis=0)


def _parse_any(buf: memoryview, off: int, out: list[np.ndarray]) -> int:
    bo = "<" if buf[off] == 1 else ">"
    t = struct.unpack_from(bo + "I", buf, off + 1)[0]
    off += 5
    base, has_z = _base_type(t)
    dim = 3 if has_z else 2
    if base in (3, 17):  # Polygon / Triangle
        nrings = struct.unpack_from(bo + "I", buf, off)[0]
        off += 4
        for r in range(nrings):
            npts = struct.unpack_from(bo + "I", buf, off)[0]
            off += 4
            pts = np.frombuffer(buf, dtype=bo + "f8", count=npts * dim, offset=off).reshape(npts, dim)
            off += npts * dim * 8
            if r == 0 and dim == 3 and npts >= 4:
                ring = pts[:-1] if np.allclose(pts[0], pts[-1]) else pts
                # fan triangulation (building faces are planar and nearly always convex)
                for k in range(1, len(ring) - 1):
                    out.append(np.stack([ring[0], ring[k], ring[k + 1]])[None, :, :].astype(np.float64))
        return off
    if base in (6, 7, 15, 16):  # MultiPolygon, GeometryCollection, PolyhedralSurface, TIN
        n = struct.unpack_from(bo + "I", buf, off)[0]
        off += 4
        for _ in range(n):
            off = _parse_any(buf, off, out)
        return off
    raise ValueError(f"unsupported WKB geometry type {t}")


def read_buildings(gpkgs: list[Path], bbox: tuple[float, float, float, float]) -> list[Building]:
    """Building solids whose bounding box intersects ``bbox`` (deduplicated by UUID)."""
    seen: set[str] = set()
    out: list[Building] = []
    for gpkg in gpkgs:
        _read_one(gpkg, bbox, seen, out)
    return out


def _read_one(gpkg: Path, bbox, seen: set[str], out: list[Building]) -> None:
    meta, _fids, geoms, fields = pyogrio.raw.read(gpkg, layer="solids", bbox=bbox)
    names = list(meta["fields"])
    col = {k: fields[names.index(k)] for k in FIELDS if k in names}
    for idx, wkb in enumerate(geoms):
        if wkb is None:
            continue
        uuid = str(col["UUID"][idx])
        if uuid in seen:
            continue
        seen.add(uuid)
        tris = parse_wkb_triangles(bytes(wkb))
        if len(tris) == 0:
            continue
        rmax = col["DACH_MAX"][idx] if "DACH_MAX" in col else None
        name = col["NAME_KOMPLETT"][idx] if "NAME_KOMPLETT" in col else None
        out.append(
            Building(
                uuid=uuid,
                objektart=str(col["OBJEKTART"][idx]),
                name=None if name is None or name == "" else str(name),
                roof_max=None if rmax is None or np.isnan(rmax) else float(rmax),
                triangles=tris,
            )
        )
