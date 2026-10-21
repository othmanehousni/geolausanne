# 0003. Voxelise offline into a quadtree of 128-voxel tiles at four levels

Status: accepted · Date: 2026-10-20

## Context

"Generate the voxel city offline, then stream precomputed geometry to the
browser" is the blueprint's most important architectural decision. It also
proposed 128 m chunks at 1 m, levels at 1/2/4/8 m, screen-space-error LOD
with hysteresis, crack-free borders, GLB files plus a manifest, a quadtree for
visibility, and a distinction between cached and drawn assets. The whole
municipality must be visible "with acceptable performance" (M4).

## Decision

* A Python pipeline voxelises everything offline
  ([pipeline](../pipeline/README.md)).
* **Every tile is 128 × 128 columns at every level**; voxel sizes 1, 2, 4,
  8 m, hence tile edges of 128, 256, 512 and 1 024 m. Each tile has exactly
  four children. Level 3 tiles are the roots.
* The quadtree is **complete**: a node is a leaf or has all four children,
  so the client can always replace a parent by its children without holes.
* **Skirts** close every tile downwards (≥ 8 m below its lowest surface) so
  neighbours at different levels never show cracks, without stitching.
* Vertex positions are **exact integers in voxel units** (int16) with a
  per-tile translation and scale, so shared edges are bit-identical.
* One fixed world origin for every build ([coordinates](../pipeline/coordinate-system.md)).
* The client selects tiles by **projected voxel size** (screen-space error),
  with **hysteresis** (×0.72) and prefetch (×0.7), keeps parents until all
  four children are ready, and keeps invisible tiles cached under a GPU budget
  with LRU eviction ([streaming](../architecture/streaming-and-lod.md)).

## Alternatives

* **Voxelising in the browser** (downloading rasters and solids): the
  blueprint rules it out: long loads, CPU and memory pressure on phones.
* **Streaming swisstopo's 3D Tiles with a voxel-looking shader**: not real
  voxel geometry (the blueprint calls it an exploration shortcut only).
* **OGC 3D Tiles as our output format** (with 3DTilesRendererJS): a standard,
  but our needs are a fixed regular quadtree with one compact manifest; the
  custom index is about a hundred lines per side and lets the tile store
  control priorities, budgets and cancellation exactly.
* **Sparse voxel octrees / ray marching in shaders**: elegant, but far more
  GPU work per pixel than rasterising greedy-meshed quads, and harder on
  phones.
* **Flat list of chunks at one resolution**: cannot show the whole
  municipality (about 41 km² of land, 67.6 km² with its share of the lake)
  at once.

## Consequences

* Geometry only changes when the city is rebuilt (minutes with a warm cache);
  dynamic content (spots) never touches it.
* The municipality is 6 482 tiles, 190 MB served; a first view downloads
  7–12 MB including the manifest and the horizon, depending on the device
  ([performance](../operations/performance.md)).
* Hosting is plain static files ([0004](0004-tile-hosting.md)).
