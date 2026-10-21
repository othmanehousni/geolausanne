"""Horizon backdrop: Lake Geneva, the Jura and the Chablais Alps.

Built from swissALTIRegio (10 m DTM covering Switzerland and the neighbouring
French shore) read straight from the national COG overviews. Two rings with
non-cubic voxels keep it light:

* inner ring: 32 m columns, 8 m vertical steps;
* outer ring: 128 m columns, 16 m vertical steps.

The rectangle covered by the city's root tiles is left empty, so the
streamed tiles and the horizon never overlap.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import config
from . import materials as M
from .export import GlbBuilder
from .heightfield import mesh_heightfield
from .log import log
from .terrain import read_regio
from .raster_io import fill_gaps

INNER = {"voxel": 32.0, "vstep": 8.0, "extent": (-16_384.0, -14_336.0, 18_432.0, 14_336.0)}
OUTER = {"voxel": 128.0, "vstep": 16.0, "extent": config.HORIZON_EXTENT}


def _colors(elev: np.ndarray, slope_deg: np.ndarray, water: np.ndarray):
    def c(hexs: str, shader=M.SHADER_PLAIN):
        h = hexs.lstrip("#")
        return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), shader], dtype=np.uint8)

    top = np.empty(elev.shape + (4,), dtype=np.uint8)
    top[:] = c("#9fbe5e")  # lowland fields
    top[(slope_deg > 12) & (elev < 1700)] = c("#5a8441")  # forested slopes
    top[(elev >= 1300) & (elev < 2100) & (slope_deg <= 25)] = c("#8eab63")  # alpine meadows
    top[(elev >= 1700) & (slope_deg > 25)] = c("#9a978f")  # rock
    top[elev >= 2350] = c("#a8a59d")
    top[elev >= 2800] = c("#eef1f4")  # snow
    top[water] = c("#4a8fcb", M.SHADER_WATER)
    side = top.copy()
    side[..., :3] = (side[..., :3].astype(np.float32) * 0.8).astype(np.uint8)
    return top, side


def _ring(spec: dict, hole: tuple[float, float, float, float]) -> tuple[np.ndarray, ...]:
    v, step = spec["voxel"], spec["vstep"]
    # extent: (west, south, east, north) offsets in metres from the LV95 origin
    dw, ds, de, dn = spec["extent"]
    w = config.ORIGIN_E + dw
    s = config.ORIGIN_N + ds
    e = config.ORIGIN_E + de
    n = config.ORIGIN_N + dn
    log(f"horizon ring {v:.0f} m: reading swissALTIRegio")
    elev = read_regio((w, s, e, n), v)
    elev = fill_gaps(elev, config.LAKE_LEVEL)
    rows, cols = elev.shape
    gy, gx = np.gradient(elev, v)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    lake = (np.abs(elev - config.LAKE_LEVEL) < 2.5) & (slope < 1.0)
    lake = ndimage.binary_opening(lake, iterations=1)
    elev = np.where(lake, config.LAKE_LEVEL, elev)
    levels = np.floor((elev - config.ORIGIN_H) / step + 0.5).astype(np.int32)
    levels[lake] = int(np.floor((config.LAKE_LEVEL - config.ORIGIN_H) / step + 0.5))
    valid = np.ones((rows, cols), dtype=bool)
    hw, hs, he, hn = hole
    c0 = int(np.floor((hw - w) / v))
    c1 = int(np.ceil((he - w) / v))
    r0 = int(np.floor((n - hn) / v))
    r1 = int(np.ceil((n - hs) / v))
    valid[max(r0, 0) : max(min(r1, rows), 0), max(c0, 0) : max(min(c1, cols), 0)] = False
    top, side = _colors(elev, slope, lake)
    # local voxel units: x = (E - E0) / v, z = (N0 - N) / v
    origin_x = int(round((w - config.ORIGIN_E) / v))
    origin_z = int(round((config.ORIGIN_N - n) / v))
    return levels, top, side, valid, origin_x, origin_z


def build_horizon(out_dir: Path) -> dict:
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    city = manifest["bounds"]["lv95"]
    b = GlbBuilder()
    voxel_mat = b.material("voxel")
    water_mat = b.material("water", roughness=0.2)
    inner_ext = INNER["extent"]
    inner_hole_lv95 = (
        config.ORIGIN_E + inner_ext[0],
        config.ORIGIN_N + inner_ext[1],
        config.ORIGIN_E + inner_ext[2],
        config.ORIGIN_N + inner_ext[3],
    )
    stats = {}
    for name, spec, hole in (("inner", INNER, tuple(city)), ("outer", OUTER, inner_hole_lv95)):
        levels, top, side, valid, ox, oz = _ring(spec, hole)
        floor = int(levels[valid].min()) - 2 if valid.any() else -2
        mesh = mesh_heightfield(levels, top, side, valid, ox, oz, floor)
        water = mesh.colors[:, 3] == M.SHADER_WATER
        quad_water = water.reshape(-1, 4)[:, 0]
        prims = []
        for sel, mat in ((~quad_water, voxel_mat), (quad_water, water_mat)):
            if not sel.any():
                continue
            qi = np.nonzero(sel)[0]
            vidx = (qi[:, None] * 4 + np.arange(4)[None, :]).reshape(-1)
            from .mesh import MeshData

            sub = MeshData(
                mesh.positions[vidx],
                mesh.colors[vidx],
                (np.arange(len(qi), dtype=np.uint32)[:, None] * 4 + np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32)).reshape(-1),
            )
            prims.append(b.add_primitive(sub, mat))
        mi = b.add_mesh(f"horizon-{name}", prims)
        b.add_node(
            {"name": f"horizon-{name}", "mesh": mi, "scale": [spec["voxel"], spec["vstep"], spec["voxel"]]},
            root=True,
        )
        stats[name] = {"quads": int(len(mesh.indices) // 6), "voxel": spec["voxel"], "vstep": spec["vstep"]}
        log(f"horizon {name}: {stats[name]['quads']} quads")
    data = b.to_bytes()
    (out_dir / "horizon.glb").write_bytes(data)
    info = {"path": "horizon.glb", "bytes": len(data), "rings": stats}
    manifest["horizon"] = info
    manifest_path.write_text(json.dumps(manifest, separators=(",", ":"), default=str))
    return info
