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
| [materials.md](materials.md) | voxel classes, the colour model (roofs from the orthophoto, facades from the building register), the shader byte, baked occlusion |
| [tile-format.md](tile-format.md) | GLB layout, compression, manifest schema |
| [horizon.md](horizon.md) | the lake-and-mountains backdrop |

## Commands

From `pipelines/geodata` with the virtual environment active
(`python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.lock -e .`):

| Command | What it does |
| --- | --- |
| `python -m geovox build --area flon --out ../../apps/web/public/city/flon` | Lausanne-Flon: 1 × 1 km at full detail inside 3 × 3 km of coarse tiles (the committed demo, 181 tiles) |
| `python -m geovox build --area agglomeration --out <dir>` | Lausanne and its 15 neighbours ([areas](#areas), 10 540 tiles) |
| `python -m geovox build --area lausanne --out <dir>` | the municipality only (6 482 tiles) |
| `python -m geovox area-plan --area agglomeration` | an area's municipalities (resolved by name), land, suggested boxes, tile and file counts, without building it |
| `python -m geovox horizon --out <dir>` | lake, Jura and Alps backdrop (`horizon.glb`) |
| `bun run city:compress <dir>` (repo root) | meshopt + gzip every GLB, rewrite sizes in the manifest |
| `python -m geovox stats --out <dir>` | print the manifest's version and per-level statistics |
| `python -m geovox seed-places --out ../../supabase/seed.sql --json ../../apps/web/src/lib/data/demo-seed.json` | halal-tagged OSM places → database seed + demo-mode data |
| `pytest` | 70 unit tests (areas and name lookup, grid maths, colour rules on measured samples, roof sampling, register join, land cover, meshing and occlusion, OSM parsing, voxelisation) |

Options of `build`: `--cache DIR` (downloads and intermediates, default
`.cache`), `--workers N` (parallel root blocks, default `min(4, CPUs)`),
`--root i,j` (one 1 km block, for debugging).

System tools: GDAL's `ogr2ogr` (File Geodatabase → GeoPackage, OSM → GeoPackage)
and `osmium` (clip the Vaud extract). Python ≥ 3.11 (3.13 in CI);
dependencies are pinned in `requirements.lock`: numpy, scipy, numba,
rasterio, pyogrio, shapely, pyproj.

## Areas

An area (`AREAS` in [`geovox/config.py`](../../pipelines/geodata/src/geovox/config.py))
is a detail box (levels 0–1), a context box (levels 2–3) and optionally a
list of **municipality names**:

| Area | Full detail | Context ring | Tiles |
| --- | --- | --- | --- |
| `agglomeration` (default of the `City tiles` workflow) | Lausanne and 15 neighbours, 95.9 km² of land | the detail box + ~1 km | 10 540 |
| `lausanne` | the municipality (BFS 5586) | ~1–4 km around it | 6 482 |
| `flon` | the 1 × 1 km box around Flon | 3 × 3 km of root tiles | 181 |

The agglomeration is Lausanne, the eight municipalities of the district of
Ouest lausannois (Bussigny, Chavannes-près-Renens, Crissier, Ecublens,
Prilly, Renens, Saint-Sulpice, Villars-Sainte-Croix) and the eastern and
northern neighbours (Pully, Paudex, Belmont-sur-Lausanne, Epalinges,
Le Mont-sur-Lausanne, Jouxtens-Mézery, Romanel-sur-Lausanne). EPFL and UNIL
(Ecublens, Chavannes, Saint-Sulpice) are in.

* **Names, not numbers.** The build looks the names up in swissBOUNDARIES3D
  (layer `tlm_hoheitsgebiet`, canton 22), ignoring case, accents and the
  canton suffix of homonyms ("Renens" finds "Renens (VD)"), and stops with
  suggestions when a name is unknown or ambiguous
  ([`geovox/boundary.py`](../../pipelines/geodata/src/geovox/boundary.py)).
  A municipality whose territory comes in several pieces is one union.
* **Detail region** = the union of the polygons minus open water (Lake
  Geneva), buffered by 250 m; a tile of level 0–1 exists where it touches
  this region. The build warns if land falls outside the detail box.
* **Boxes**: `area-plan` prints boxes that fit the land (buffer 250 m,
  snapped outwards to the 128 m tile grid; context ring + 1 024 m) for a new
  list of names; paste them into `AREAS`.

### File budget

Cloudflare Pages (free plan) accepts **20 000 files per deployment** and
25 MiB per file. A deployment holds every non-empty tile, the manifest, the
horizon and `_headers`; `build` and `area-plan` count the upper bound and
warn above `FILE_BUDGET` = 18 500, which leaves room for small additions.
The agglomeration plans 10 540 tiles (7 300 / 1 980 / 1 008 / 252 per level),
so at most 10 543 files; its largest file is the horizon (1.4 MB) and its
largest tile 128 KB (a level-3 root), far from the 25 MiB limit. Level 0 is
69 % of the files: an area that outgrows the budget needs level 0
restricted (to the built-up land, for example) or a second Pages project,
not a smaller context ring (levels 2–3 are 12 %).

## Stages

```
            ┌──────────────── download (STAC, checksum-verified, cached) ───────────────┐
 swissALTI3D 2 m · swissSURFACE3D 0.5 m · SWISSIMAGE 2 m + 0.4 m · swissBUILDINGS3D 3.0
 swissBOUNDARIES3D · GWR (building register, Vaud) · OSM Vaud
            └──────────────────────────────────────┬────────────────────────────────────┘
                                                   │
 1. plan        complete quadtree over the area (children exist iff the parent intersects
                the child level's region: municipalities + 250 m for levels 0–1, coarse box above)
 2. per root    one process per 1 024 m root block (+ 24 m margin):
    block       ├ terrain, surface model, orthophoto mosaicked at 1 m
                ├ land cover: OSM features + orthophoto where OSM is silent, lake from the DTM
                ├ building solids (triangles); roof colour per building from the 0.4 m
                │ orthophoto, facade palette from the register (era, class) and OSM
                ├ trees from the normalised surface model, bridge deck profiles
 3. per tile    voxelise (terrain columns + skirts, buildings by ray parity, bridges,
                trees: instanced on level 0, stamped / canopy volume above)
 4. mesh        greedy meshing (+ baked occlusion on levels 0–1) → opaque + water primitives
 5. export      quantised GLB + manifest   →   6. compress (meshopt + gzip)
```

Each stage is described in [voxelization.md](voxelization.md). The block
structure means every source raster is read **once per root tile** and reused
for its 1 + 4 + 16 + 64 descendants; blocks run in parallel processes.

## Results

| Build | Tiles (L0 / L1 / L2 / L3) | Quads | Raw | Served | Time* |
| --- | --- | --- | --- | --- | --- |
| `flon` (committed demo, `3980b9b485a5`, format 2) | 100 / 36 / 36 / 9 | 2.07 M | 182 MB | **13.8 MB** | 54 s |
| `agglomeration` (`e0c529278b2d`, format 2) | 7 300 / 1 980 / 1 008 / 252 | 68.5 M | 4 611 MB | **348.5 MB** | 23 min |
| `lausanne` (`0d885f38502f`, format 1, before the colour model) | 4 096 / 1 196 / 952 / 238 | 42.7 M | 2 895 MB | **190 MB** | ~5–8 min |

\* Measured on 4 shared cores with 4 worker processes. The agglomeration
run had most sources cached: tiles 20.4 min (of which 11.2 min of block
processing, the rest converting the OSM clip and the building sheets and
fetching the 0.4 m roof imagery), horizon 13 s, compression 160 s. A first
run also downloads about 1.8 GB (3.3 GB in the [cache](data-sources.md)
once converted). Peak memory of the whole build is **3.5 GB** (4 workers,
sampled every second; 1.4 GB for the municipality before the colour
model), so it still fits the smallest GitHub runner (private repositories:
2 CPUs, 8 GB of RAM, 14 GB of disk), where block processing takes about
twice as long; disk peaks at ~8 GB (cache 3.3 GB and raw tiles 4.6 GB
before compression).

The 16 municipalities measure 159.0 km² including their share of Lake
Geneva; full detail covers the 95.9 km² of land plus a 250 m margin. The
agglomeration build contains 323 747 instanced trees and 36 037 buildings
(the municipality build: 221 656 trees).
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
[deployment](../operations/deployment.md#city-tiles-on-cloudflare-pages).
