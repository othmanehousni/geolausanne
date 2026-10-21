# The geodata pipeline (`geovox`)

`pipelines/geodata` turns open Swiss geodata and OpenStreetMap into the voxel
city: a quadtree of glTF tiles at four levels of detail, a horizon backdrop
and a manifest. It runs **offline** (on a laptop or in GitHub Actions); the
browser only downloads ready-to-draw meshes. This follows the blueprint's
central advice: "generate the voxel city offline, then stream precomputed
geometry" ([ADR 0003](../decisions/0003-offline-voxelization-and-quadtree.md)).

| Page | Contents |
| --- | --- |
| [data-sources.md](data-sources.md) | every dataset, edition, licence, and why it was chosen |
| [coordinate-system.md](coordinate-system.md) | LV95, the world origin, tile addressing, precision |
| [voxelization.md](voxelization.md) | terrain, land cover, lake, buildings, trees, bridges, meshing |
| [materials.md](materials.md) | voxel classes, colours, shader classes, roof colours |
| [tile-format.md](tile-format.md) | GLB layout, compression, manifest schema |
| [horizon.md](horizon.md) | the lake-and-mountains backdrop |

## Commands

From `pipelines/geodata` with the virtual environment active
(`python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.lock -e .`):

| Command | What it does |
| --- | --- |
| `python -m geovox build --area flon --out ../../apps/web/public/city/flon` | Lausanne-Flon: 1 × 1 km at full detail inside 3 × 3 km of coarse tiles (the committed demo, 181 tiles) |
| `python -m geovox build --area lausanne --out <dir>` | the whole municipality (6 482 tiles) |
| `python -m geovox horizon --out <dir>` | lake, Jura and Alps backdrop (`horizon.glb`) |
| `bun run city:compress <dir>` (repo root) | meshopt + gzip every GLB, rewrite sizes in the manifest |
| `python -m geovox stats --out <dir>` | print the manifest's version and per-level statistics |
| `python -m geovox seed-places --out ../../supabase/seed.sql --json ../../apps/web/src/lib/data/demo-seed.json` | halal-tagged OSM places → database seed + demo-mode data |
| `pytest` | 26 unit tests (grid maths, materials, meshing, OSM parsing, voxelisation) |

Options of `build`: `--cache DIR` (downloads and intermediates, default
`.cache`), `--workers N` (parallel root blocks, default `min(4, CPUs)`),
`--root i,j` (one 1 km block, for debugging).

System tools: GDAL's `ogr2ogr` (File Geodatabase → GeoPackage, OSM → GeoPackage)
and `osmium` (clip the Vaud extract). Python ≥ 3.11 (3.13 in CI);
dependencies are pinned in `requirements.lock`: numpy, scipy, numba,
rasterio, pyogrio, shapely, pyproj.

## Stages

```
            ┌──────────────── download (STAC, checksum-verified, cached) ───────────────┐
 swissALTI3D 2 m · swissSURFACE3D 0.5 m · SWISSIMAGE 2 m · swissBUILDINGS3D 3.0 · boundaries · OSM Vaud
            └──────────────────────────────────────┬────────────────────────────────────┘
                                                   │
 1. plan        complete quadtree over the area (children exist iff the parent intersects
                the child level's region: municipality + 250 m for levels 0–1, coarse box above)
 2. per root    one process per 1 024 m root block (+ 24 m margin):
    block       ├ terrain, surface model, orthophoto mosaicked at 1 m
                ├ land cover: OSM features + orthophoto where OSM is silent, lake from the DTM
                ├ building solids (triangles), roof colours
                ├ trees from the normalised surface model, bridge deck profiles
 3. per tile    voxelise (terrain columns + skirts, buildings by ray parity, bridges,
                trees: instanced on level 0, stamped / canopy volume above)
 4. mesh        greedy meshing → opaque + water primitives
 5. export      quantised GLB + manifest   →   6. compress (meshopt + gzip)
```

Each stage is described in [voxelization.md](voxelization.md). The block
structure means every source raster is read **once per root tile** and reused
for its 1 + 4 + 16 + 64 descendants; blocks run in parallel processes.

## Results

| Build | Tiles (L0 / L1 / L2 / L3) | Quads | Raw | Served | Time* |
| --- | --- | --- | --- | --- | --- |
| `flon` (committed demo, `fef715809343`) | 100 / 36 / 36 / 9 | 1.7 M | 157 MB | **11.1 MB** | < 30 s |
| `lausanne` (`0d885f38502f`) | 4 096 / 1 196 / 952 / 238 | 42.7 M | 2 895 MB | **190 MB** | ~5–8 min |

\* With sources already in the cache, 4 worker processes: tiles 4–6 min,
horizon 10–25 s, compression ~75 s for the municipality. A first run also
downloads ~3 GB (the swissBUILDINGS3D sheets are the largest part, 1.8 GB);
the `City tiles` workflow budgets 30–60 min on a GitHub runner.

The municipality polygon measures 67.6 km² including Lausanne's share of Lake
Geneva; the open lake is left out of levels 0–1, so full detail covers the
land plus a 250 m margin. The build contains 221 656 instanced trees.
Per-level sizes and first-view measurements are in
[performance](../operations/performance.md).

## Reproducibility

* Sources are discovered through the swisstopo STAC API, **newest edition
  per map sheet**; the editions actually used are recorded in the manifest
  (`editions`: e.g. swissALTI3D 2019/2021, swissSURFACE3D 2023/2025,
  SWISSIMAGE 2023, swissBUILDINGS3D sheets of 2015–2020, the OSM extract
  timestamp).
* Every download is verified against the SHA-256 multihash published in STAC
  and kept in the cache; nothing is executed from downloaded files (they are
  only parsed by GDAL/numpy).
* All randomness (wall colours, tree species, rotations) is a hash of stable
  inputs (building UUID, coordinates), so a rebuild with the same editions
  produces the same city and the same `version`.

## Running it in GitHub Actions

`.github/workflows/city.yml` (manual trigger) installs GDAL and osmium,
builds an area, the horizon, compresses, adds the CDN `_headers` and deploys
to Cloudflare Pages, or keeps the result as a 3-day artifact. See
[deployment](../operations/deployment.md#3-city-tiles-on-cloudflare-pages).
