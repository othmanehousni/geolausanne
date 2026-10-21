# Coordinate system

Every number here is defined once in
[`pipelines/geodata/src/geovox/config.py`](../../pipelines/geodata/src/geovox/config.py)
and mirrored in
[`packages/geo-types/src/grid.ts`](../../packages/geo-types/src/grid.ts) and
[`apps/web/src/lib/world/config.ts`](../../apps/web/src/lib/world/config.ts).
The manifest of every build repeats them, so the client never has to guess.

## Reference frames

| Frame | Used for | Units |
| --- | --- | --- |
| **LV95** (EPSG:2056), Swiss oblique Mercator on the Bessel 1841 ellipsoid | every swisstopo product, all pipeline maths, tile addressing | metres (E ≈ 2.5 M, N ≈ 1.15 M) |
| **LN02** heights | swissALTI3D, swissSURFACE3D, swissBUILDINGS3D | metres above sea level |
| **WGS84** (EPSG:4326) | the database (`places.location`), GPS positions, OpenStreetMap | degrees |
| **World** (three.js) | everything the GPU sees | metres from a fixed origin |

LN02 differs from the newer LHN95 frame by a few centimetres to decimetres
around Lausanne. With voxels of 1 m or more the difference cannot be seen, so
heights are used as delivered.

## The world frame

```
world x = E - 2 538 000      (east)
world y = H - 372            (up)
world z = 1 152 000 - N      (south, so north is -z)
```

This is the convention proposed in the blueprint: right-handed, y up, north
towards −z, which is what `OrbitControls`/`MapControls` expect.

**Why this origin.**

* `(E0, N0) = (2 538 000, 1 152 000)` is a round kilometre next to
  Lausanne-Flon, the centre of interest. Being a multiple of 1 024 m from
  nothing in particular does not matter; being *fixed* does: tiles of every
  level are aligned on the same lattice in every build (Flon prototype, whole
  municipality), and a marker computed today lands on the same voxel as a tile
  built next year.
* `H0 = 372 m` is the mean level of Lake Geneva, so the lake surface is world
  `y = 0` exactly and water quads are perfectly flat.

**Why an origin at all.** A `Float32` has a 24-bit mantissa. Raw LV95
eastings (≈ 2.5 × 10⁶) would be stored with a step of 0.25 m, so vertices
would jitter visibly when the camera moves. Relative to the origin the whole
render area stays within ±42 km, where the step is below 4 mm (within ±16 km,
below 1 mm). All pipeline maths runs in `float64` LV95 and only the exported
vertices are local, as the blueprint recommends.

## Levels of detail and tiles

Every tile, at every level, is a grid of **128 × 128 columns**. Each level
doubles the voxel size, so each tile has exactly four children:

| Level | Voxel | Tile edge | Role |
| --- | --- | --- | --- |
| 0 | 1 m | 128 m | street level; instanced voxel trees |
| 1 | 2 m | 256 m | neighbourhood |
| 2 | 4 m | 512 m | district |
| 3 | 8 m | 1 024 m | quadtree roots (always loaded first) |

A tile `(level, i, j)` with edge `S = 128 · voxel` covers

```
E ∈ [E0 + i·S, E0 + (i+1)·S)      N ∈ [N0 + j·S, N0 + (j+1)·S)
```

* children: `(level − 1, 2i + di, 2j + dj)` with `di, dj ∈ {0, 1}`
* file: `lod{level}/{i}_{j}.glb` (indices can be negative: `lod0/-6_-2.glb`)
* world box: `x ∈ [i·S, (i+1)·S]`, `z ∈ [−(j+1)·S, −j·S]`; the vertical
  extent comes from the manifest (`minY`, `maxY` per tile)

Inside a tile, vertices are stored in **voxel units** relative to the tile's
north-west corner (`lx = (E − Ewest) / v`, `lz = (Nnorth − N) / v`,
`ly = (H − H0) / v`). The glTF node carries the translation
`(i·S, 0, −(j+1)·S)` and a uniform scale `v`. Because every vertex is an exact
integer and every translation is an exact multiple of the voxel size,
neighbouring tiles share edges bit for bit (no T-junction gaps from rounding).
`int16` positions leave room for ±32 767 voxels, i.e. heights up to 32 km at
level 0.

**Vertical quantisation.** Voxel `k` spans `[H0 + k·v, H0 + (k+1)·v)`. A ground
height `h` becomes level `floor((h − H0) / v + 0.5)` (round to nearest), so
the voxel top is within half a voxel of the true surface at every level.

## Converting between frames

[`packages/geo-types/src/swiss.ts`](../../packages/geo-types/src/swiss.ts)
implements the **rigorous** LV95 ↔ WGS84 conversion: swisstopo's exact
(non-series) formulas for the oblique conformal cylindrical projection plus
the official three-parameter datum shift CH1903+ → WGS84 (674.374 m, 15.056 m,
405.346 m). That is exactly what PostGIS/PROJ apply for EPSG:2056 ↔ 4326, and
the unit tests compare against coordinates computed by PostGIS
(`packages/geo-types/test/postgis-reference*.json`): results agree to well
below a millimetre.

The popular swisstopo *approximate* formulas were rejected: they are accurate
to about a metre, which is one voxel at level 0. The database converts places
to LV95 with `ST_Transform` (see `private.to_result`), the browser converts
picks back to WGS84 with `swiss.ts`; both must agree or a spot would drift a
block away from where it was placed.

| Conversion | Where |
| --- | --- |
| LV95 ↔ world | `lv95ToWorld` / `worldToLv95` (`geo-types/grid.ts`), `apps/web/src/lib/world/navigation.ts` |
| LV95 ↔ WGS84 | `lv95ToWgs84` / `wgs84ToLv95` (`geo-types/swiss.ts`); in SQL `ST_Transform(location, 2056)` |
| WGS84 → world (markers) | database returns `easting`/`northing` per place → `lv95ToWorld` |
| world → WGS84 (new spot) | pick on the map → `worldToLv95` → `lv95ToWgs84` → `create_place(p_lon, p_lat, p_elevation)` |

## Heights of things placed by people

* **Markers** stand on the surface that is drawn *right now*: a downward ray
  against the loaded tiles (`surfaceHeightAt` in
  `apps/web/src/lib/world/picking.ts`) finds the roof or ground at the spot's
  position, whatever the level of detail. If no tile is loaded there yet, the
  stored `places.elevation` is used.
* **New spots** record the elevation of the picked point (a roof, a terrace or
  the street), so other people see the pin where its author put it.

## Third-party coordinate quirks

* The GeoAdmin SearchServer returns `attrs.x` = **northing** and `attrs.y` =
  **easting** (the historical Swiss axis order). `apps/web/src/lib/geo/geocoder.ts`
  swaps them; a unit test pins this down.
* swisstopo STAC searches take a WGS84 `bbox`; the pipeline converts its LV95
  areas with `pyproj` before querying (`geovox/stac.py`).
* swissBUILDINGS3D solids are not consistently wound (see
  [voxelization.md](voxelization.md#2-preparing-a-block-one-per-root-tile)).
