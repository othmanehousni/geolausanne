# The blueprint, point by point

The project started from a technical blueprint written with another
assistant ("A fully voxelized 3D Lausanne"). This page records, for each of
its recommendations, what was done and why anything differs.

## Technology choices

| Blueprint | Built | Notes |
| --- | --- | --- |
| Next.js + TypeScript | Next.js 16.4, React 19.3, TypeScript 5.9 | App Router, static pages, next-intl |
| Three.js as the primary renderer | ✓ three.js 0.186 | not MapLibre, as advised |
| React Three Fiber | ✓ R3F 9, drei 10 | |
| Drei OrbitControls | drei **MapControls** | map-style gestures (one finger pans), same limits idea ([0002](../decisions/0002-react-three-fiber.md)) |
| Custom greedy meshing | ✓ `geovox/mesh.py` | plus a heightfield mesher for the horizon |
| swissALTI3D | ✓ 2 m, as advised | resampled to 1 m, lightly smoothed |
| swissBUILDINGS3D 3.0 Beta (Solid, File Geodatabase) | ✓ `Building_solid` | converted with GDAL's OpenFileGDB driver; TIN geometry parsed from WKB |
| swissTLM3D + OpenStreetMap | **OpenStreetMap only** | swissTLM3D is a 4.8 GB national archive; OSM has the urban detail ([0005](../decisions/0005-openstreetmap-for-surfaces.md)) |
| Python, GDAL, Rasterio, Shapely | ✓ + numpy, scipy, numba, pyogrio, pyproj | geopandas, trimesh, mapbox-earcut were not needed |
| GLB/glTF + CDN | ✓ quantised GLB + meshopt + gzip on Cloudflare Pages | ([0004](../decisions/0004-tile-hosting.md), [0021](../decisions/0021-meshopt-and-gzip.md)) |
| Supabase + PostGIS | ✓ | RPC-only API, RLS ([0008](../decisions/0008-supabase-rpc-and-rls.md)) |
| Vercel + object storage/CDN | ✓ Vercel Hobby + Cloudflare Pages | free tiers ([0018](../decisions/0018-free-tier-only.md)) |
| WebGL, not WebGPU | ✓ | |

## The most important decision: offline generation

Followed exactly: the browser never touches raw geodata; it streams ready
tiles ([0003](../decisions/0003-offline-voxelization-and-quadtree.md)).

## Rendering architecture

| Blueprint component | Implementation |
| --- | --- |
| City World Manager | `CityTiles` (per-frame selection) + `TileStore` (loading, cache) |
| Chunk streamer | worker pool, concurrency limits, cancellation, retries |
| LOD manager | `lod.ts`: screen-space error, hysteresis, all-children rule, prefetch |
| GPU resource cache | byte budget per quality, LRU eviction of invisible tiles |
| Interaction manager | `picking.ts` (BVH ray casts), instanced pins with hit ids |
| Static vs dynamic worlds | tiles never change at runtime; spots come from the database |

## Geodata pipeline (8 steps)

All eight steps exist (download via the STAC API, clip to the municipality,
LV95 throughout, surfaces, voxelise, mesh, levels of detail, export) plus a
compression step and a horizon backdrop. The blueprint's STAC `curl` example
became `geovox/stac.py` (newest edition per sheet, checksum-verified
downloads).

## Coordinates

Exactly the proposed convention (x = E − E0, y = H − H0, z = N0 − N), with
the origin fixed at (2 538 000, 1 152 000, 372): a round kilometre at Flon,
and the lake surface at y = 0. All pipeline maths in float64 LV95, local
coordinates only at export ([coordinate system](../pipeline/coordinate-system.md)).

## Voxels

* **Terrain**: quantised columns, exposed faces only, chunk skirts, colours
  from land cover, as described.
* **Buildings**: footprint *and* roof silhouette kept (vertical-ray parity
  against closed solids), never extruded footprints; wall and roof materials
  assigned per building.
* **Greedy meshing**: as described.

## Chunking and LOD

Four levels at 1/2/4/8 m with the same global grid; tiles keep 128 × 128
columns at every level (128 m at level 0, as proposed for "near"); borders
are crack-free thanks to skirts and exact integer vertices; selection by
projected screen-space error with hysteresis, as required.

Performance targets: the blueprint's 150–250 MB GPU budget is respected by
the medium and low presets (220 and 120 MB caps) and by the measured first
views (56–107 MB). The 60/30 FPS targets could not be measured in the build
environment (no GPU); see [performance](../operations/performance.md).

## Output format

The proposed layout (`manifest.json`, `lod0/…lod3/`) with `i_j.glb` names
(indices can be negative). The manifest records the origin, extent, version,
conventions and per-tile metadata, plus sizes, statistics, editions and
attribution. The World Manager's six steps and the "cached vs active"
distinction are implemented as described, on a quadtree.

## Project structure

Same monorepo shape (`apps/web`, `packages/geo-types`, `pipelines/geodata`,
`supabase/migrations`). Differences: `components/world` has `CameraRig`,
`CityTiles`, `Horizon`, `PlaceMarkers`…; `lib/supabase` became `lib/data` (a
repository interface with Supabase and demo implementations); `roads.py`
became `osm.py` + `landcover.py`, joined by `vegetation.py`, `horizon.py`,
`heightfield.py`, `prefabs.py`, `stac.py`; no `app/api` (the browser calls
database functions directly).

## First development steps

Days 1–7 were followed in spirit: real Flon terrain and buildings first,
then chunking and streaming, then the whole city. The placeholder
`demo.glb` was skipped: the first pipeline output was already a real tiled
area.

## Halal spots in the city

* `geometry(Point, 4326)` with a GiST index, as proposed; the table gained
  categories, halal level, certification claim and verification, counters,
  status and moderation fields ([data model](../backend/data-model.md)).
* Viewport query with `ST_MakeEnvelope` and LV95 conversion with
  `ST_Transform(…, 2056)` in the database, as proposed.
* Marker heights: sampled from the 3D world (downward ray on the drawn tiles).
* Interaction flow: click → ray cast → world → LV95 → WGS84 → duplicate check
  → create; all community data in Supabase.
* Security: counts computed server-side, one review (with one confirmation)
  per user and spot, RLS, moderation workflow, **votes never equal
  certification**.

## The 3D Tiles shortcut

Skipped: the real voxel pipeline was built directly, which the blueprint
considered the hardest and most important part.

## Milestones

| | Blueprint deliverable | Status |
| --- | --- | --- |
| M1 | rotatable 3D view with real terrain | done |
| M2 | Flon with voxelised buildings and streets | done (committed demo) |
| M3 | chunk streaming, LOD, zooming across the city | done |
| M4 | entire municipality with acceptable performance | done: 6 482 tiles, 190 MB, first view 5–10 MB of tiles |
| M5 | clickable places, submissions, map search | done |
| M6 | halal confirmations, reviews, moderation, launch | done in code; launch needs the owner's accounts ([deployment](../operations/deployment.md)) |

Details and evidence: [overview](../overview.md#milestones).

## "Real geometry before decoration"

Followed: terrain and buildings were made correct first; then trees
(instanced, from real data), facade windows and night lights (procedural),
animated water, the horizon and the day/night cycle, exactly the "easy with
instancing" list the blueprint gave.

## The immediate objective

"A 500 m × 500 m portion of Lausanne-Flon at 2 m resolution": exceeded, with
the whole municipality at 1 m voxels near the camera.
