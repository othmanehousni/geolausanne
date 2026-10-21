# 0025. Colours from open data on a pixel-art palette

Status: accepted · Date: 2026-10-21 · Supersedes [0017](0017-roof-colours-from-roof-shape.md)

## Context

The owner found the city bland and asked for "actual colours of the
buildings and all", alive and pixel-art, "while actually portraying
reality". Looking at the first model with that request in mind:

* Facades were a random pick among ten creams per building: nothing told an
  1890 molasse house from a 1970 concrete block or a glass office.
* Roofs (ADR 0017) came from the roof shape and a 2 m orthophoto sample at
  triangle centroids; the photo barely mattered.
* Pitched roofs voxelise into staircases whose risers took the **facade**
  colour, so from any oblique view roofs looked striped.
* The palette's sRGB values were fed to the shader as if they were linear,
  so everything rendered lighter and greyer than the palette (the main reason
  for the "bland" impression).
* Ground classes were few and muted; forests one flat green.

Measurements that shaped the decision (Flon and Cité, 0.4 m overview of
SWISSIMAGE 10 cm): the per-roof median CIELAB chroma is 3.8 at 0.4 m against
3.9 with the 2 m sampling — the orthophoto is hazy at any resolution — but
the finer, filtered pixels make the **hue** reliable (clay 40–75°, copper
160–205°, panels dark and blue, gravel and membranes neutral).

## Decision

Colours come from evidence, then snap to a curated palette with small
deterministic per-building variation
([materials](../pipeline/materials.md)):

* **Roofs**: the 0.4 m internal overview of the 10 cm orthophoto, read by
  HTTP range requests and cached (≈ 1.4 MB per km²); a robust colour per roof
  (edges, vegetation and shadows out, median CIELAB of the sunlit 60 %);
  classified by hue family (terracotta, brown, sand, slate, metal, gravel,
  membrane, green, copper, solar, glass), shade from lightness. The roof shape
  only breaks ties among neutral colours and fills in where there is no
  photo.
* **Facades**: the federal building register (GWR/RegBL public extract:
  construction year or period, building class) joined spatially to the
  solids; swissBUILDINGS3D types (churches, tanks, greenhouses...); OSM
  `building:colour` and `building:material` when mapped. Era and type select
  one of 13 palettes inspired by Lausanne (molasse and ochre renders before
  1919, creams between the wars, concrete and white after, glass offices,
  metal sheds, wooden barns, stone churches) and a window style.
* **Roof steps** get the roof colour (a darker shade), facades stop at the
  eaves.
* **Ground**: 35 classes — fields coloured per polygon from the photo
  (green, ripe, ploughed), allotments, flower beds, outdoor pools, dirt,
  water tinted by distance to the shore; forest canopies as 12 m patches of
  two greens (broadleaf) or dark and blue-green (conifers).
* **Ambient occlusion** baked per vertex on levels 0–1 only, restricted to
  what does not cut every facade into strips (foot of walls, eaves, ground
  along buildings).
* **The shader byte** packs class, variant and occlusion
  (`class << 5 | variant << 2 | ao`); vertex colours are sRGB albedos the
  client linearises. Manifest **format 2**; the client still reads format 1.

## Alternatives

* **Texturing roofs per voxel from the photo** (each roof column takes its
  pixel's colour): the most literal, but the orthophoto is not a true
  orthophoto (towers lean several metres onto their neighbours), shadows
  would be painted on, and per-pixel noise breaks the greedy merging (many
  more quads) and the pixel-art read. Per-roof families keep the truth that
  matters (this roof is clay, that one gravel) and stay clean.
* **Downloading the 10 cm sheets**: 400 times more data than the 2 m product
  for no gain over the 0.4 m overview.
* **Ambient occlusion everywhere, or with every neighbour**: +63 % quads on a
  dense block. Restricted and on levels 0–1 only, the whole colour model
  (occlusion included) costs +21 % quads and +25 % served bytes on the Flon
  demo, mostly on levels 0–1 (+32 % quads there). Screen-space AO was weighed too: free in
  data but soft, view-dependent and costly on phones and on the CI's
  software renderer.
* **EGID join**: swissBUILDINGS3D carries no EGID in Vaud; the register's
  coordinates fall inside (or within 3 m of) the right footprint.
* **Street-level imagery for facades**: no open source covers Lausanne.

## Consequences

* A build reads the 0.4 m overview of every km² sheet (≈ 450 MB cache for
  the agglomeration) and the 84 MB register extract once; block preparation
  takes 5–8 s instead of ~2 s.
* The register requires naming its source (FSO, GWR): manifest sources and
  [data licensing](../legal/data-licensing.md); the about page needs a row.
* Served bytes grow by about a quarter (Flon demo 11.1 → 13.8 MB), mostly on
  the two finest levels.
* New tiles need the new client (format 2); the new client draws old tiles.
  Deploy the web app first, then the tiles.
* The roof rules are pinned by tests on measured CIELAB samples.
