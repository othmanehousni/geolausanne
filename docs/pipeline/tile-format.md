# Tile format and manifest

A built city is a directory of static files:

```
<city>/
  manifest.json         what exists, where, and how to read it
  lod3/<i>_<j>.glb      1 024 m roots, 8 m voxels
  lod2/<i>_<j>.glb        512 m tiles, 4 m voxels
  lod1/<i>_<j>.glb        256 m tiles, 2 m voxels
  lod0/<i>_<j>.glb        128 m tiles, 1 m voxels (+ instanced trees)
  horizon.glb           lake, Jura and Alps backdrop (horizon.md)
  _headers              cache rules for Cloudflare Pages (production only)
```

Writer: [`geovox/export.py`](../../pipelines/geodata/src/geovox/export.py) and
[`geovox/manifest.py`](../../pipelines/geodata/src/geovox/manifest.py).
Compressor: [`tools/meshopt-compress.ts`](../../pipelines/geodata/tools/meshopt-compress.ts).
Reader: [`apps/web/src/lib/world/tile-format.ts`](../../apps/web/src/lib/world/tile-format.ts)
(runs in a Web Worker, see [streaming](../architecture/streaming-and-lod.md)).
Schema types: [`packages/geo-types/src/manifest.ts`](../../packages/geo-types/src/manifest.ts).

## Tiles: a deliberately small glTF 2.0 subset

Each tile is a valid binary glTF (`.glb`) that any viewer can open, but it only
uses the features the city needs:

```
scene
└─ node "tile"   translation = (i·S, 0, −(j+1)·S), scale = (v, v, v)
   │             extras = { level, i, j, voxelSize }
   ├─ mesh "voxels"
   │   ├─ primitive, material "voxel"  (opaque: terrain, buildings, bridges, canopies)
   │   └─ primitive, material "water"  (only when the tile has water)
   └─ child nodes (level 0 only): one per tree prefab, EXT_mesh_gpu_instancing
```

**Vertex stream** (one interleaved buffer view, stride 12 bytes):

| Bytes | Attribute | Type | Meaning |
| --- | --- | --- | --- |
| 0–5 | `POSITION` | `int16 × 3` | exact voxel coordinates in the tile (`KHR_mesh_quantization`) |
| 6–7 | padding | – | keeps the stride 4-byte aligned |
| 8–11 | `COLOR_0` | `uint8 × 4`, normalised | RGB = face colour, **A = shader class** ([materials.md](materials.md)) |

**Indices**: `uint16` when a primitive has ≤ 65 535 vertices, otherwise
`uint32`; triangles only (`mode 4`).

**No normals, no UVs, no textures.** Faces are axis-aligned, so the fragment
shader derives a flat normal from screen-space derivatives; colour comes from
the vertex; small details (facade windows, water ripples, per-voxel jitter) are
procedural in world space ([rendering](../architecture/rendering.md)). This
removes 12–20 bytes per vertex compared with a conventional mesh.

**Instanced trees** (`EXT_mesh_gpu_instancing`): each of the six prefabs
(broadleaf and conifer, three sizes each) is meshed once; per-instance `TRANSLATION` (`float32 ×
3`, voxel units) and optional `ROTATION` (quarter turns about y, `float32 × 4`).
Prefabs are centred on a voxel corner so rotated trees stay on the voxel
lattice ([voxelization.md](voxelization.md#3-voxelising-a-tile)).

## Compression

The Python writer emits plain GLBs. `bun run city:compress <dir>` then:

1. re-encodes every buffer view with **`KHR_meshopt_compression`** using the
   official `meshoptimizer` encoder (vertex codec for the interleaved stream,
   index codec for triangles). Accessors are untouched, so decoded geometry is
   bit-identical;
2. **gzips** the whole file. meshopt output is designed to be followed by a
   general-purpose compressor, which roughly halves it again;
3. rewrites `manifest.json`: per-tile `bytes`, per-level `stats.*.bytes`,
   `horizon.bytes` and a `compression` block
   (`{ meshopt, gzip, rawBytes, servedBytes }`).

Files are stored already gzipped and served as opaque bytes. The client checks
the gzip magic number (`1f 8b`) and inflates with the browser's native
`DecompressionStream`, so no CDN `Content-Encoding` setup is needed and the
same files work from Next.js, Cloudflare Pages or any static host. Files that
are already compressed are skipped, so the step is idempotent.

Result for the whole municipality (build `0d885f38502f`): **2 895 MB raw →
190 MB served** (6 483 files, ×15.2). See [ADR 0021](../decisions/0021-meshopt-and-gzip.md)
for why not Draco or Brotli.

## Manifest

`manifest.json` (format `geolausanne-voxel-city`, `formatVersion` 1):

| Field | Example | Notes |
| --- | --- | --- |
| `city`, `area` | `"lausanne"`, `"lausanne"` | area = build target (`flon`, `lausanne`) |
| `version` | `"0d885f38502f"` | SHA-256 (12 hex digits) of the tile table and dataset editions; appended to every tile URL as `?v=` |
| `generatedAt` | ISO timestamp | |
| `crs`, `heightReference` | `"EPSG:2056"`, `"LN02"` | |
| `origin` | `{ easting: 2538000, northing: 1152000, elevation: 372 }` | [coordinate-system.md](coordinate-system.md) |
| `axes` | `{ x: "east", y: "up", z: "south" }` | |
| `tileVoxels`, `rootLevel` | `128`, `3` | |
| `lods` | `[{ level, voxelSize, tileSize }, …]` | |
| `lakeLevel` | `372` | |
| `bounds` | `{ lv95: [w, s, e, n], wgs84: [w, s, e, n] }` | extent of all root tiles |
| `tileFields`, `tiles` | `["level","i","j","minY","maxY","bytes"]`, rows | one compact row per tile; `bytes = 0` means "empty, no file" |
| `horizon` | `{ path, bytes, rings }` or `null` | |
| `stats` | per level `{ tiles, empty, bytes, quads, instances }` | |
| `editions` | dataset editions actually used | e.g. `swissALTI3D: ["2019","2021"]`, OSM extract timestamp |
| `sources`, `attribution` | list of datasets + licences, credit line | displayed by the app |
| `compression` | `{ meshopt, gzip, rawBytes, servedBytes }` | added by the compressor |

Tiles are a **complete quadtree**: a node is either a leaf or has all four
children in the manifest (the client marks such nodes `refinable`). `minY`/
`maxY` give a tight vertical extent for frustum culling and screen-space error
before the tile is downloaded.

The manifest is the only file whose content changes under a fixed URL, so it
is fetched with `cache: "no-cache"` and served with a 60-second cache; tiles
are immutable for a year because a new build changes `?v=`
([deployment](../operations/deployment.md#cache-headers)).

## Compatibility rules

* `FORMAT_VERSION` lives in `manifest.py` **and** `manifest.ts`; bump both on
  any breaking change. The client refuses other versions with a clear error.
* Shader classes in `materials.py` and `apps/web/src/lib/world/materials.ts`
  must match.
* The decoder rejects anything outside the subset (other attribute types,
  missing indices, non-float instance attributes) instead of rendering garbage.
