# geovox — the voxel Lausanne geodata pipeline

`geovox` turns open Swiss geodata and OpenStreetMap into a streamed, block-style
3D city: a quadtree of glTF (`.glb`) tiles at four levels of detail plus a
`manifest.json` that the web app (`apps/web`) streams with three.js.

Everything is generated **offline**; the browser only downloads ready-to-render
meshes. The full design rationale lives in [`docs/pipeline`](../../docs/pipeline/README.md).

## What it produces

```
<out>/
  manifest.json        # origin, LOD table, tile list (+ bounds, sizes), sources, attribution
  lod3/<i>_<j>.glb     # 1024 m tiles, 8 m voxels   (roots of the quadtree)
  lod2/<i>_<j>.glb     #  512 m tiles, 4 m voxels
  lod1/<i>_<j>.glb     #  256 m tiles, 2 m voxels
  lod0/<i>_<j>.glb     #  128 m tiles, 1 m voxels   (+ instanced voxel trees)
  horizon.glb          # lake, Jura and Alps backdrop (32 m / 128 m columns)
```

Each tile is a 128 × 128 column grid. Vertex positions are exact integers in voxel
units (`KHR_mesh_quantization`, int16); the node scale equals the voxel size, so
neighbouring tiles share edges bit-for-bit. Buffers are compressed with
`KHR_meshopt_compression` and gzip by `tools/meshopt-compress.ts`.

## Data sources (all free)

| Data | Source | Used for |
| --- | --- | --- |
| Terrain | swissALTI3D 2 m (swisstopo, OGD) | ground heights |
| Buildings | swissBUILDINGS3D 3.0 Beta, `Building_solid` (swisstopo, OGD) | voxelised building solids incl. roofs |
| Surface model | swissSURFACE3D raster 2025 (swisstopo, OGD) | tree heights (nDSM), bridge decks |
| Orthophoto | SWISSIMAGE 10 cm: the 2 m product and the 0.4 m overview (swisstopo, OGD) | roof colours (0.4 m), grass vs paved ground and field colours (2 m) |
| Building register | GWR / RegBL public extract of the canton of Vaud (FSO, free use with source) | facade colours: construction period and building class |
| Boundaries | swissBOUNDARIES3D (swisstopo, OGD) | the municipalities of the area, looked up by name |
| Horizon | swissALTIRegio 10 m (swisstopo, OGD) | lake shore, Jura, Chablais Alps |
| Vectors | OpenStreetMap, canton of Vaud extract (ODbL) | roads, rails, water, land use, parks, bridges, pools, mapped building colours |

Files are discovered through the swisstopo STAC API (newest edition per map tile),
downloaded once into the cache and verified against their published SHA-256
multihashes. swisstopo data must be credited ("© swisstopo"), the building
register ("Source: FSO, GWR") and OpenStreetMap data ("© OpenStreetMap
contributors"); the manifest carries the attributions, and
[docs/legal/data-licensing.md](../../docs/legal/data-licensing.md) lists where
the web app shows them.

## Requirements

* Python ≥ 3.11 (developed on 3.13)
* GDAL command line tools (`ogr2ogr`) and `osmium-tool`
  (Ubuntu: `sudo apt install gdal-bin osmium-tool`, macOS: `brew install gdal osmium-tool`)
* [Bun](https://bun.sh) for the compression step (already used by the monorepo)
* ~8 GB of free disk for the agglomeration (3.3 GB of cache, 4.6 GB of raw tiles
  before compression; 0.35 GB once compressed)

```bash
cd pipelines/geodata
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.lock -e .
```

## Usage

```bash
# from pipelines/geodata (venv active)
python -m geovox build --area flon          --out ../../apps/web/public/city/flon            # the committed demo (~1 km at full detail)
python -m geovox build --area agglomeration --out ../../apps/web/public/city/agglomeration   # Lausanne + 15 neighbours (not committed)
python -m geovox build --area lausanne      --out ../../apps/web/public/city/lausanne        # the municipality only
python -m geovox area-plan --area agglomeration                                              # municipalities, boxes, tile count; no build

# then, for the output directory you built:
python -m geovox horizon --out ../../apps/web/public/city/agglomeration                  # lake + mountains backdrop
(cd ../.. && bun run city:compress apps/web/public/city/agglomeration)                     # meshopt + gzip
python -m geovox stats --out ../../apps/web/public/city/agglomeration

python -m geovox seed-places --out ../../supabase/seed.sql --json ../../apps/web/src/lib/data/demo-seed.json
pytest                                                                                 # unit tests
```

Options: `--cache DIR` (default `.cache`), `--workers N` (parallel root blocks),
`--root i,j` (only one 1 km block, for debugging). Set
`NEXT_PUBLIC_CITY_BASE_URL=/city/agglomeration` in `apps/web/.env.local` to
view a local full build. Areas, their municipalities and the hosting file
budget: [docs/pipeline/README.md](../../docs/pipeline/README.md#areas). In
production the `City tiles` GitHub workflow builds and
publishes the city ([docs/operations/deployment.md](../../docs/operations/deployment.md)).

## How it works (short version)

1. **Plan** a complete quadtree: root tiles (LOD 3) cover the area's coarse box; a
   tile gets all four children when it intersects the region of the child level
   (the area's municipalities on land + 250 m for LOD 0/1). A node is either a leaf
   or fully refined.
2. **Prepare a block** per root tile: mosaic terrain, surface model and orthophoto
   at 1 m, classify every square metre from OSM (+ orthophoto where OSM is silent),
   read building solids and colour them (roof from the 0.4 m orthophoto, facade
   from the building register and OSM), detect trees (local maxima of the masked
   nDSM) and derive bridge deck profiles from the surface model.
3. **Voxelise each tile**: terrain columns (class voxel on top, soil below, skirts
   down to `min - 8 m`), buildings by vertical-ray parity against their closed
   triangle surfaces, bridge decks and pillars, and voxel trees (instanced prefabs
   on LOD 0, stamped ellipsoids above).
4. **Greedy-mesh** the grid: only solid/air faces, merged into maximal rectangles of
   equal colour, with ambient occlusion baked into the vertices on LOD 0/1.
5. **Export** quantised GLB + manifest, then compress.
