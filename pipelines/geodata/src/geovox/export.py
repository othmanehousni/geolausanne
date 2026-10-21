"""Minimal glTF 2.0 binary (GLB) writer for voxel tiles.

Geometry layout (see docs/pipeline/tile-format.md):

* one interleaved vertex stream, 12 bytes per vertex:
  ``POSITION`` int16 x3 (+2 bytes padding, KHR_mesh_quantization) and
  ``COLOR_0`` uint8 x4 normalised (RGB colour, A = shader class);
* ``uint16``/``uint32`` triangle indices;
* positions are exact integers in voxel units; the node carries the tile's
  translation and a uniform scale equal to the voxel size, so world-space
  vertices are exact and neighbouring tiles share edges bit-for-bit;
* optional instanced prefabs (trees) through ``EXT_mesh_gpu_instancing``.

Compression (EXT_meshopt_compression) is applied afterwards by
``tools/meshopt-compress.ts`` using the official meshoptimizer encoder.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .mesh import MeshData

ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963
BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT, UNSIGNED_INT, FLOAT = 5120, 5121, 5122, 5123, 5125, 5126


@dataclass
class Instances:
    mesh: MeshData
    translations: np.ndarray  # (n, 3) float32, local voxel units
    rotations: np.ndarray | None = None  # (n, 4) float32 quaternions (x, y, z, w)
    name: str = "prefab"


@dataclass
class GlbBuilder:
    json: dict = field(default_factory=lambda: {
        "asset": {"version": "2.0", "generator": "geolausanne geovox"},
        "scene": 0,
        "scenes": [{"nodes": []}],
        "nodes": [],
        "meshes": [],
        "materials": [],
        "accessors": [],
        "bufferViews": [],
        "buffers": [],
    })
    bin: bytearray = field(default_factory=bytearray)
    extensions_used: set[str] = field(default_factory=set)
    extensions_required: set[str] = field(default_factory=set)

    def _align(self, n: int = 4) -> None:
        while len(self.bin) % n:
            self.bin.append(0)

    def add_view(self, data: bytes, target: int | None, stride: int | None = None) -> int:
        self._align(4)
        view = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if stride:
            view["byteStride"] = stride
        if target:
            view["target"] = target
        self.bin.extend(data)
        self.json["bufferViews"].append(view)
        return len(self.json["bufferViews"]) - 1

    def add_accessor(self, view: int, offset: int, ctype: int, count: int, atype: str,
                     normalized: bool = False, minv=None, maxv=None) -> int:
        acc = {"bufferView": view, "byteOffset": offset, "componentType": ctype, "count": count, "type": atype}
        if normalized:
            acc["normalized"] = True
        if minv is not None:
            acc["min"] = minv
            acc["max"] = maxv
        self.json["accessors"].append(acc)
        return len(self.json["accessors"]) - 1

    def material(self, name: str, color=(1.0, 1.0, 1.0, 1.0), roughness: float = 1.0) -> int:
        for i, m in enumerate(self.json["materials"]):
            if m["name"] == name:
                return i
        self.json["materials"].append({
            "name": name,
            "pbrMetallicRoughness": {"baseColorFactor": list(color), "metallicFactor": 0.0, "roughnessFactor": roughness},
        })
        return len(self.json["materials"]) - 1

    def add_primitive(self, mesh: MeshData, material: int) -> dict:
        """Interleaved int16 position + rgba8 colour stream."""
        v = len(mesh.positions)
        inter = np.zeros(v, dtype=[("p", "<i2", 3), ("pad", "<i2"), ("c", "u1", 4)])
        inter["p"] = mesh.positions
        inter["c"] = mesh.colors
        view = self.add_view(inter.tobytes(), ARRAY_BUFFER, stride=12)
        pmin = mesh.positions.min(axis=0).astype(int).tolist()
        pmax = mesh.positions.max(axis=0).astype(int).tolist()
        pos = self.add_accessor(view, 0, SHORT, v, "VEC3", minv=pmin, maxv=pmax)
        col = self.add_accessor(view, 8, UNSIGNED_BYTE, v, "VEC4", normalized=True)
        if v <= 65535:
            idx_bytes = mesh.indices.astype("<u2").tobytes()
            ictype = UNSIGNED_SHORT
        else:
            idx_bytes = mesh.indices.astype("<u4").tobytes()
            ictype = UNSIGNED_INT
        iview = self.add_view(idx_bytes, ELEMENT_ARRAY_BUFFER)
        ind = self.add_accessor(iview, 0, ictype, len(mesh.indices), "SCALAR")
        self.extensions_used.add("KHR_mesh_quantization")
        self.extensions_required.add("KHR_mesh_quantization")
        return {"attributes": {"POSITION": pos, "COLOR_0": col}, "indices": ind, "material": material, "mode": 4}

    def add_mesh(self, name: str, primitives: list[dict]) -> int:
        self.json["meshes"].append({"name": name, "primitives": primitives})
        return len(self.json["meshes"]) - 1

    def add_node(self, node: dict, root: bool = False) -> int:
        self.json["nodes"].append(node)
        idx = len(self.json["nodes"]) - 1
        if root:
            self.json["scenes"][0]["nodes"].append(idx)
        return idx

    def add_instances(self, inst: Instances, material: int) -> int:
        prim = self.add_primitive(inst.mesh, material)
        mesh = self.add_mesh(inst.name, [prim])
        t = np.ascontiguousarray(inst.translations, dtype="<f4")
        tview = self.add_view(t.tobytes(), None)
        tacc = self.add_accessor(tview, 0, FLOAT, len(t), "VEC3", minv=t.min(0).tolist(), maxv=t.max(0).tolist())
        attrs = {"TRANSLATION": tacc}
        if inst.rotations is not None:
            r = np.ascontiguousarray(inst.rotations, dtype="<f4")
            rview = self.add_view(r.tobytes(), None)
            attrs["ROTATION"] = self.add_accessor(rview, 0, FLOAT, len(r), "VEC4")
        self.extensions_used.add("EXT_mesh_gpu_instancing")
        self.extensions_required.add("EXT_mesh_gpu_instancing")
        return self.add_node({"name": inst.name, "mesh": mesh, "extensions": {"EXT_mesh_gpu_instancing": {"attributes": attrs}}})

    def to_bytes(self) -> bytes:
        self._align(4)
        j = dict(self.json)
        j["buffers"] = [{"byteLength": len(self.bin)}]
        for key in ("materials", "meshes", "accessors", "bufferViews"):
            if not j[key]:
                j.pop(key)
        if self.extensions_used:
            j["extensionsUsed"] = sorted(self.extensions_used)
        if self.extensions_required:
            j["extensionsRequired"] = sorted(self.extensions_required)
        jb = json.dumps(j, separators=(",", ":")).encode("utf-8")
        jb += b" " * ((4 - len(jb) % 4) % 4)
        total = 12 + 8 + len(jb) + 8 + len(self.bin)
        out = bytearray()
        out += struct.pack("<III", 0x46546C67, 2, total)
        out += struct.pack("<II", len(jb), 0x4E4F534A) + jb
        out += struct.pack("<II", len(self.bin), 0x004E4942) + self.bin
        return bytes(out)


def write_tile_glb(
    path: Path,
    translation: tuple[float, float, float],
    scale: float,
    opaque: MeshData,
    water: MeshData,
    instances: list[Instances],
    extras: dict,
) -> int:
    b = GlbBuilder()
    prims = []
    if not opaque.is_empty():
        prims.append(b.add_primitive(opaque, b.material("voxel")))
    if not water.is_empty():
        prims.append(b.add_primitive(water, b.material("water", roughness=0.2)))
    children: list[int] = []
    for inst in instances:
        if len(inst.translations):
            children.append(b.add_instances(inst, b.material("voxel")))
    node: dict = {
        "name": "tile",
        "translation": [float(t) for t in translation],
        "scale": [float(scale)] * 3,
        "extras": extras,
    }
    if prims:
        node["mesh"] = b.add_mesh("voxels", prims)
    if children:
        node["children"] = children
    b.add_node(node, root=True)
    data = b.to_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)
