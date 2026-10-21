# Data sources

Everything the city is built from is free: Swiss federal open government data
(swisstopo, free since 2021 including commercial use, attribution required)
and OpenStreetMap (ODbL). Licensing obligations are in
[legal/data-licensing.md](../legal/data-licensing.md).

## Datasets used by the pipeline

| Dataset | What we take | Resolution | Editions in the current build | Access | Used for |
| --- | --- | --- | --- | --- | --- |
| **swissALTI3D** | digital terrain model (ground without buildings or vegetation), COG per 1 km sheet | 2 m | 2019, 2021 | STAC `ch.swisstopo.swissalti3d` | ground heights; the lake surface |
| **swissSURFACE3D Raster** | digital surface model (with buildings and trees) | 0.5 m, read at 1 m | 2023, 2025 | STAC `ch.swisstopo.swisssurface3d-raster`, the COG's first overview | tree heights (nDSM), bridge decks |
| **SWISSIMAGE 10 cm** | orthophoto, the 2 m product | 2 m | 2023 | STAC `ch.swisstopo.swissimage-dop10` | grass vs paved ground where OSM is silent; field colours; vegetation check |
| **SWISSIMAGE 10 cm** | the same orthophoto, internal overview of the 10 cm COG | 0.4 m | 2023 | the 10 cm asset of each sheet, read with HTTP range requests (overview 1) and cached as a small GeoTIFF | roof colours ([materials](materials.md#roofs)) |
| **swissBUILDINGS3D 3.0 Beta** | `Building_solid` layer: closed triangulated building bodies with roofs | vector | 27 map sheets, 2015–2020 | STAC `ch.swisstopo.swissbuildings3d_3_0` (File Geodatabase per sheet) | every building |
| **swissBOUNDARIES3D** | municipality polygons (layer `tlm_hoheitsgebiet`) | vector | 2026-01 | STAC `ch.swisstopo.swissboundaries3d` | which tiles get full detail: the municipalities of the build area, looked up by name ([areas](README.md#areas)) |
| **GWR / RegBL** (Federal Register of Buildings and Dwellings) | public extract of the canton of Vaud: coordinates, construction year (`GBAUJ`) or period (`GBAUP`), category (`GKAT`) and class (`GKLAS`) of each existing building | points | export of the day (2026-10-21) | `public.madd.bfs.admin.ch/vd.zip` (84 MB), FSO | facade colours ([materials](materials.md#facades)) |
| **swissALTIRegio** | national terrain model, one COG | 10 m | current | `data.geo.admin.ch/ch.swisstopo.swissaltiregio/…` (HTTP range requests) | the horizon: lake shores, Jura, Chablais Alps |
| **OpenStreetMap** | canton of Vaud extract (openstreetmap.fr), clipped with osmium | vector | extract of 2026-10-19 | `download.openstreetmap.fr/extracts/europe/switzerland/vaud-latest.osm.pbf` (63 MB) | roads, rails, paths, water, land use, parks, bridges, leaf types, swimming pools, flower beds, mapped `building:colour` / `roof:colour` / materials; halal seed places |

Cache for the agglomeration, about **3.3 GB** (1.8 GB of downloads, the rest
converted from them): buildings 1.65 GB (zipped sheets 0.3 GB, File
Geodatabases 0.8 GB, GeoPackages 0.54 GB), surface model (1 m) 0.52 GB, roof
imagery (0.4 m) 0.45 GB, terrain 0.29 GB, OSM 0.14 GB (extract and clip),
boundaries 0.11 GB, building register 84 MB, orthophoto (2 m) 46 MB.

The register join matches **96.2 %** of the agglomeration's 36 037 buildings
(Lausanne 94.8 %, the neighbours 94.8–98.3 %); the others take an era
guessed from their roof (see [materials](materials.md#facades)). Of the matched buildings, 13 % were
built before 1919, 10 % between the wars, 38 % in 1946–1980, 19 % in
1981–2000 and 18 % since 2001.

## How files are found and fetched

* **STAC discovery** ([`geovox/stac.py`](../../pipelines/geodata/src/geovox/stac.py)):
  paginated item search by bounding box, then for each map sheet the **newest
  edition** whose asset matches the wanted product and resolution. The
  editions used end up in the manifest.
* **Downloads** ([`geovox/download.py`](../../pipelines/geodata/src/geovox/download.py)):
  cached, verified against the SHA-256 multihash STAC publishes, through the
  standard proxy and CA variables. Downloaded files are untrusted data: they
  are only parsed by GDAL and numpy.
* **Remote COGs**: the surface model and swissALTIRegio are read with HTTP
  range requests at the overview level needed (1 m and 32–128 m), instead of
  downloading full-resolution files.
* **Buildings**: each sheet's File Geodatabase is converted once with
  `ogr2ogr` (GDAL's OpenFileGDB driver) into a GeoPackage; triangles are then
  parsed straight from WKB because GEOS (Shapely) cannot represent `TIN Z`
  geometries.
* **OSM**: `osmium extract` clips the Vaud extract to the work area, GDAL's OSM
  driver converts it to an LV95 GeoPackage using our
  [`osmconf.ini`](../../pipelines/geodata/src/geovox/osmconf.ini). It promotes
  the tags read most (`highway`, `width`, `surface`, `layer`, `bridge`,
  `area:highway`, `landuse`, `diet:halal`, …) to columns and keeps every other
  tag as JSON `other_tags`, which the reader merges back (`leaf_type` on
  forests, for example).

## Choices and alternatives

**Terrain at 2 m, not 0.5 m.** The blueprint's advice, confirmed in practice:
the 0.5 m product is 16 times larger, and level 0 has 1 m voxels whose tops
are rounded to the nearest metre anyway. The 2 m model is bilinearly
resampled to 1 m and lightly smoothed (Gaussian σ = 1 m) so sub-metre bumps
do not quantise into speckle.

**Surface model at 1 m.** Tree crowns and bridge decks only need 1 m; reading
the COG's first overview cuts the transfer by four.

**Orthophoto at 2 m.** Enough to tell a red roof from a grey one and grass from
asphalt; the 10 cm product would be 400 times larger.

**swissBUILDINGS3D instead of extruded footprints.** The blueprint insists on
real roofs; the `Building_solid` layer has them (pitched roofs, towers,
passages). It is a Beta product and Vaud is not in the EGID-enabled regions,
which does not matter here: only geometry is used. Some sheets are from 2015,
so recent buildings may be missing; the orthophoto-based vegetation check also
avoids placing trees on new construction sites.

**OpenStreetMap instead of swissTLM3D for surfaces.** The blueprint proposed
swissTLM3D + OSM. swissTLM3D is only distributed as one national archive per
edition (the 2026-02 GeoPackage is **4.8 GB** zipped) against 63 MB for the
OSM Vaud extract, and OSM carries the urban detail the city needs
(pedestrian areas, `area:highway` polygons, surfaces, widths, parking,
playgrounds, pitches, bridge layers). OSM was needed anyway for halal places.
See [ADR 0005](../decisions/0005-openstreetmap-for-surfaces.md).

**The lake comes from the terrain model.** A regional OSM extract cannot
assemble the Lake Geneva multipolygon (it spans France and Geneva), but
swissALTI3D stores the lake as a flat surface at about 372.13 m. Large
connected regions at lake level are the lake
([ADR 0007](../decisions/0007-lake-from-the-terrain-model.md)).

**Trees from the surface model**, not from OSM tree nodes (sparse) or a
random scatter: every real tree taller than 3 m is detected
([ADR 0006](../decisions/0006-trees-from-the-surface-model.md)).

**Not used: swisstopo's Cesium 3D Tiles.** The blueprint suggested loading
them with 3DTilesRendererJS as a temporary shortcut; it would not produce
voxel geometry and the real pipeline was built directly.

## Services used at runtime (not by the pipeline)

| Service | Used for | Cost / limits |
| --- | --- | --- |
| GeoAdmin SearchServer (`api3.geo.admin.ch/rest/services/api/SearchServer`) | street, place, municipality and postcode search | free, no key, fair use |
| GeoAdmin identify on `ch.bfs.gebaeude_wohnungs_register` | address of a picked location (federal building register) | free, no key, fair use |
| OpenStreetMap website | "Directions" link from a spot | free link-out |

See [ADR 0013](../decisions/0013-swisstopo-geocoding.md).
