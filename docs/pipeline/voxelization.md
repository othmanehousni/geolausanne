# From geodata to voxels

Code: [`build_city.py`](../../pipelines/geodata/src/geovox/build_city.py)
(orchestration), [`landcover.py`](../../pipelines/geodata/src/geovox/landcover.py),
[`vegetation.py`](../../pipelines/geodata/src/geovox/vegetation.py),
[`buildings.py`](../../pipelines/geodata/src/geovox/buildings.py),
[`voxelize.py`](../../pipelines/geodata/src/geovox/voxelize.py),
[`mesh.py`](../../pipelines/geodata/src/geovox/mesh.py),
[`prefabs.py`](../../pipelines/geodata/src/geovox/prefabs.py).
The hot loops are compiled with numba.

The goal from the blueprint: Lausanne must stay *recognisable* (real terrain,
real roofs, real streets) while every surface is blocky.

## 1. Planning the quadtree

`plan_tiles` starts from the root tiles (level 3, 1 024 m) covering the
area's coarse box and walks down: a tile gets **all four** children when it
intersects the region of the child level. For levels 0–1 that region is the
municipality polygon minus the open lake, buffered by 250 m; for level 2 it is
the coarse box. Every refined node therefore has its four children, which the
client relies on to swap a parent for its children without holes.

## 2. Preparing a block (one per root tile)

Each root tile plus a 24 m margin is prepared once, then the root and its up
to 84 descendants are voxelised from the same in-memory rasters:

**Terrain.** swissALTI3D is mosaicked and bilinearly resampled to 1 m, gaps
are filled with the lake level, and a light Gaussian blur (σ = 1 m) removes
sub-metre bumps that would quantise into speckle.

**Land cover** (one `uint8` class per square metre):

1. *Orthophoto base* where OSM says nothing: excess-green index
   `(2G − R − B) / (R + G + B) > 0.045` and not too dark → grass; dark and not
   green → asphalt; otherwise pavement. The result is mode-filtered (5 m) and
   regions under 24 m² are merged into their surroundings, because voxels read
   better (and mesh far smaller) with clean regions than with per-pixel noise.
2. *OSM polygons* painted by priority (water 90 > plazas 60 > `area:highway`
   55 > parking 50 > track 46 > pitch 45 > playground 44 > sand/rock 40 >
   grass/parks 25 > vineyard 24 > scrub/orchard 22 > forest 20 > meadow/farmland
   18 > railway land 12).
3. *OSM lines* buffered by their `width` tag or a typical width per highway
   type: major roads (motorway → secondary), minor roads, cycleways, pedestrian
   streets (plaza), footways and paths (paved or not, from `surface`), rails,
   rivers.
4. *The lake* from the terrain model: swissALTI3D stores Lake Geneva as a flat
   surface (~372.13 m), so connected regions within 0.55 m of 372 m and larger
   than 5 000 m² become water. Regional OSM extracts cannot assemble the lake
   multipolygon, which spans France and Geneva.

**Buildings.** swissBUILDINGS3D `Building_solid` triangles (UUID, `OBJEKTART`,
roof heights). For each building: its footprint is rasterised (used to keep
trees off buildings), its **roof colour** is chosen from the orthophoto and the
share of pitched roof area, its wall colour from a hash of its UUID
([materials](materials.md#buildings)).

*Finding:* the solids are not consistently wound; some are inside-out. Each
solid is oriented with the **sign of its volume** (sum of signed tetrahedra
from its centroid) before roof normals are read; without this, part of the
city had its roofs classified as floors.

**Trees** (`detect_trees`), see [ADR 0006](../decisions/0006-trees-from-the-surface-model.md):

* nDSM = swissSURFACE3D − swissALTI3D (object heights);
* vegetation = nDSM > 3 m, away from building footprints (dilated by 2 m) and
  water, and **green in the orthophoto** (excess green > −0.02, which rejects
  cranes, new buildings and vehicles), then a morphological opening;
* tree tops = local maxima (5 m window) of the smoothed canopy height above
  4 m; height = local max of the nDSM (3–45 m); crown radius = distance to the
  canopy edge, capped by 0.42 × height and by 62 % of the distance to the
  nearest other tree, clamped to 1.2–7 m;
* species: conifer probability from OSM `leaf_type` (needle 0.85, mixed 0.45,
  broad 0.1; forest without tag 0.35; elsewhere 0.08), plus 0.15 for slender
  crowns; drawn from a coordinate hash, so it is stable across builds.

**Bridges.** OSM bridge ways become decks: the deck height along the way is
the median-filtered surface model, never below the terrain + 0.5 m; at-grade
"bridges" (culverts) are simply painted on the terrain.

## 3. Voxelising a tile

A tile is a dense `uint16` grid `grid[x, y, z]` (x east, y up, z south,
128 × ny × 128), where voxel `y` is absolute level `y + k_min`.

1. **Terrain columns.** The 1 m rasters are averaged (heights) or
   mode-filtered (classes) down to the tile's voxel size. Lake cells get the
   exact lake level. Heights are rounded to voxel levels, and single-voxel
   islands (from rounding along x.5 m contours) are merged away. Each column
   is soil up to its top voxel, which gets the surface class.
2. **Skirts.** The grid floor sits `max(2, ⌈8 m / voxel⌉)` voxels below the
   lowest surface, and faces on the tile's sides are always emitted, so a
   level-2 tile next to a level-0 tile never shows a crack, only a short wall
   of soil that is hidden below the neighbour's surface.
3. **Buildings: vertical-ray parity.** For every column centre (with a tiny
   sub-voxel jitter so rays never hit shared triangle edges twice), a vertical
   ray is intersected with the building's closed surface; the sorted hits pair
   up into inside spans that are filled. This keeps pitched roofs, towers,
   overhangs and passages (the blueprint's "do not extrude footprints"). A
   span thinner than a voxel still gets one voxel if it is thicker than a
   quarter voxel (thin canopies, slabs). Non-watertight solids (odd hit
   count) fall back to filling between the lowest and highest hit.
4. **Bridges.** One-voxel decks stamped at the interpolated deck height;
   2 m pillars every ~28 m wherever the deck is at least 4 m above the ground.
5. **Trees.**
   * *Level 0:* each tree becomes an **instance** of the closest of six
     prefabs (broadleaf/conifer × small/medium/large, chosen by height and
     radius on a log scale), rotated by a quarter turn chosen from a
     coordinate hash. Prefabs are centred on a voxel corner so rotations keep
     every vertex on the lattice. 221 656 instances for the municipality.
   * *Levels 1–3:* isolated trees are stamped as voxel ellipsoids (broadleaf)
     or cones (conifer) with a trunk; **dense forest becomes one continuous
     canopy volume** (cells with ≥ 50 % vegetation, top = smoothed mean canopy
     height), because hundreds of separate blobs at 4–8 m look like noise and
     mesh badly. Needle-leaf forests get the darker leaf colour.

## 4. Greedy meshing

`greedy_mesh` emits only faces between a solid voxel and air (plus the tile's
side faces, never its floor) and merges coplanar neighbouring faces with the
same colour key into maximal rectangles, direction by direction, slice by
slice. A facade of hundreds of voxels becomes a handful of quads while still
looking blocky (the blueprint's "18 quads → 1 quad").

The colour key of a face is (voxel value, face kind: top / side / bottom);
building values look up their colours in the tile's building table. Water
faces go into a separate primitive with its own material. The output is
exact integer vertex positions, colours with shader classes, and indices,
ready for [the GLB writer](tile-format.md).

## Tests

`pytest` (26 tests) covers:

* `test_grid.py`: world round trip, parent/children, tile bounds and
  translation, exact bbox coverage, height rounding, and that a plan always
  has complete children;
* `test_mesh.py`: face counts (no floor faces), slab merging into one quad,
  integer positions offset by `k_min`, water in its own primitive, roof/wall
  colours on building faces, closed meshes for interior tiles;
* `test_voxelize.py`: a box voxelises to its exact volume, a pitched roof
  follows its slope, terrain columns, footprints, trees only fill air, and the
  WKB triangle parsers (TIN fast path, multipolygon fan triangulation);
* `test_osm.py`: promoted tag columns map back to OSM keys;
* `test_materials.py`: the roof colour rules.
