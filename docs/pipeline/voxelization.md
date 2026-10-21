# From geodata to voxels

Code: [`build_city.py`](../../pipelines/geodata/src/geovox/build_city.py)
(orchestration), [`landcover.py`](../../pipelines/geodata/src/geovox/landcover.py),
[`vegetation.py`](../../pipelines/geodata/src/geovox/vegetation.py),
[`buildings.py`](../../pipelines/geodata/src/geovox/buildings.py),
[`roofs.py`](../../pipelines/geodata/src/geovox/roofs.py),
[`gwr.py`](../../pipelines/geodata/src/geovox/gwr.py),
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
union of the area's municipalities minus open water (Lake Geneva from the
terrain model, large OSM water bodies), buffered by 250 m
([areas](README.md#areas)); for level 2 it is the coarse box. Every refined
node therefore has its four children, which the client relies on to swap a
parent for its children without holes.

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
2. *OSM polygons* painted by priority (outdoor pools 92 > fountains 91 >
   water 90 > plazas 60 > `area:highway` 55 > parking 50 > track 46 >
   pitch 45 > playground 44 > sand/rock 40 > flower beds 27 >
   grass/parks 25 > vineyard 24 > allotments and community gardens 23 >
   scrub/orchard/wetland 22 > construction sites and brownfields (dirt) 21 >
   forest 20 > meadow/farmland 18 > railway land 12). Each **farmland**
   polygon takes its colour from its orthophoto pixels (median CIELAB):
   green crops (a\* < −3), ripe cereals and stubble (light and yellow),
   ploughed soil (L\* < 52). Indoor, covered and rooftop pools are skipped.
3. *OSM lines* buffered by their `width` tag or a typical width per highway
   type: major roads (motorway → secondary), minor roads, cycleways, pedestrian
   streets (plaza), footways and paths (paved or not, from `surface`), rails,
   rivers.
4. *The lake* from the terrain model: swissALTI3D stores Lake Geneva as a flat
   surface (~372.13 m), so connected regions within 0.55 m of 372 m and larger
   than 5 000 m² become water. Regional OSM extracts cannot assemble the lake
   multipolygon, which spans France and Geneva.
5. *Clean-up and depth.* Regions under 6 cells merge into their
   surroundings, then pools are painted back (they are small on purpose).
   Water is tinted by its distance to the shore, measured on a 4 m terrain
   raster with 192 m of context so that neighbouring blocks agree (there is
   no bathymetry in the sources): shallow under 30 m, deep beyond 160 m;
   rivers and ponds count as shallow.

**Buildings.** swissBUILDINGS3D `Building_solid` triangles (UUID, `OBJEKTART`,
roof heights). Their footprints are rasterised into a 1 m label raster over a
**colour window**: the block grown to hold every building whole, snapped to a
2 m grid anchored at the world origin, so a building that crosses a block
edge is sampled and matched identically in every block it appears in (before,
neighbouring blocks could give one building two colours). Then, per building
([materials](materials.md#roofs)):

* **roof**: a robust colour of its roof triangles in the 0.4 m orthophoto
  (edges eroded, vegetation and shadows out, median CIELAB of the sunlit
  60 %), classified into a roof family and shade; OSM `roof:*` tags and the
  building type (greenhouses) settle what the photo cannot see;
* **facade**: the building register record whose coordinates fall in its
  footprint or within 3 m of it (where several records fall on one
  building, the one with the largest ground area describes it), giving the
  construction year or period and the building class; with its
  swissBUILDINGS3D type and OSM `building:colour` / `building:material` this
  selects a facade palette and a window style
  ([materials](materials.md#facades));
* the footprint also keeps trees off buildings.

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
  crowns; drawn from a coordinate hash, so it is stable across builds;
* shade: two crown colours per kind (light and mid green for broadleaves,
  dark and blue-green for conifers), from another coordinate hash.

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
   *Roof steps.* A pitched roof voxelises into a staircase whose vertical
   steps used to take the facade colour, so roofs looked striped from any
   oblique view. Each building now has two voxel values (body
   `BUILDING_BASE + 2i`, roof steps `+ 1`): where a column's top hit lies on
   a pitched triangle (vertical normal component 0.2–0.95, about 18–78°),
   the voxels above the lowest neighbouring column of the same building, at
   most 3, take the roof value. Eaves and towers rising from a roof (deeper
   steps) keep the facade.
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
     mesh badly. The canopy is painted in 12 m patches anchored to the world
     (so all levels agree): two greens for broadleaves, dark and blue-green
     for conifers, a mosaic of both in mixed forests.

## 4. Greedy meshing

`greedy_mesh` emits only faces between a solid voxel and air (plus the tile's
side faces, never its floor) and merges coplanar neighbouring faces with the
same colour key into maximal rectangles, direction by direction, slice by
slice. A facade of hundreds of voxels becomes a handful of quads while still
looking blocky (the blueprint's "18 quads → 1 quad").

The colour key of a face is (voxel value, face kind: top / side / bottom);
building values look up their colours in the tile's building table. Water
faces go into a separate primitive with its own material. The output is
exact integer vertex positions, colours with the shader byte, and indices,
ready for [the GLB writer](tile-format.md).

**Baked ambient occlusion** (levels 0–1 only): each face also gets the
occlusion of its four corners (0–3, from the voxels beside and diagonal to
the corner in the layer in front of it), and the four values are part of the
merge key, so open faces still merge as before. To keep the cost modest,
ground faces are darkened only by buildings and bridges (terrain steps would
cut every hillside into strips), walls only at their foot and under
overhangs, and roof steps darken nothing. With the richer colours, the Flon
demo grows by 21 % in quads and 25 % in served bytes, mostly on levels 0–1
(+36 % and +27 % quads, against +4–5 % on levels 2–3, where occlusion would
be invisible anyway; see [materials](materials.md#ambient-occlusion)).

## Tests

`pytest` (70 tests; one needs the boundaries in the cache) covers:

* `test_grid.py`: world round trip, parent/children, tile bounds and
  translation, exact bbox coverage, height rounding, and that a plan always
  has complete children;
* `test_areas.py`: municipality names resolve to their BFS numbers (exact,
  or without accents and canton suffix), unknown and ambiguous names fail
  with suggestions, the areas are well formed, suggested boxes cover the
  buffered land on the tile grid, a plan over two disjoint municipalities is
  complete and stays local, and (with the boundaries cached) the real
  agglomeration resolves;
* `test_lake.py`: the open lake keeps large flat water only;
* `test_landcover.py`: field colours from photo pixels, outdoor pools only
  and kept through the clean-up, water tinted by distance from the shore,
  patchy forest canopies with darker conifers, two stable shades per tree
  kind;
* `test_mesh.py`: face counts (no floor faces), slab merging into one quad,
  integer positions offset by `k_min`, water in its own primitive, roof/wall
  colours on building faces, closed meshes for interior tiles; occlusion
  darkens the foot of walls and the ground along them, can be switched off,
  costs few quads, and the steps of a pitched roof do not darken each other;
* `test_voxelize.py`: a box voxelises to its exact volume, a pitched roof
  follows its slope and its steps take the roof value while flat roofs and
  towers keep their facade, terrain columns, footprints, trees only fill
  air, and the WKB triangle parsers (TIN fast path, multipolygon fan
  triangulation);
* `test_osm.py`: promoted tag columns map back to OSM keys;
* `test_materials.py`: the shader byte, the class table, CIELAB round trip,
  the roof rules on samples measured on real roofs (hazy clay, slate, metal,
  gravel, membranes, green roofs, copper, panels), the fallback without a
  photo, palette shades and their small variation, facade palettes by era
  and by building type, the era guessed from the roof without a register
  match, OSM colour and material overrides, determinism;
* `test_roofs.py`: footprint rasterisation, the robust roof sample (shadows
  and overhanging trees out, green roofs kept, panels counted, too few
  pixels → no sample), per-building samples without edge pixels, taller
  roofs winning where roofs overlap, mosaicking the 0.4 m sheets on their
  pixel grid, and the colour window on the world grid;
* `test_gwr.py`: parsing the extract (existing buildings only, year or
  period), the join by footprint with a 3 m tolerance and the largest
  entry.
