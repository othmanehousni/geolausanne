# Materials and colours

Source of truth: [`geovox/materials.py`](../../pipelines/geodata/src/geovox/materials.py)
(palettes, the shader byte, the roof and facade rules) and
[`apps/web/src/lib/world/materials.ts`](../../apps/web/src/lib/world/materials.ts)
(shaders). The two files must agree on [the shader byte](#the-shader-byte).
Decision record: [ADR 0025](../decisions/0025-colour-model-from-open-data.md)
(it supersedes [ADR 0017](../decisions/0017-roof-colours-from-roof-shape.md)).

The colours portray reality from open data, then land on a curated pixel-art
palette:

| What | Evidence | Palette |
| --- | --- | --- |
| roofs | the 10 cm orthophoto, read at 0.4 m: a robust colour per roof | 11 families × 3 shades |
| facades | the federal building register (construction period, building class), swissBUILDINGS3D types, OSM `building:colour` / `building:material` | 13 palettes, 1–9 colours each |
| ground | OpenStreetMap land use, the orthophoto (fields, grass), the terrain model (lake, shore distance) | 35 classes |
| trees | the surface model (height, crown), OSM `leaf_type` | broadleaf and conifer shades, autumn in the client |

Small deterministic variations (a hash of the building UUID or of world
coordinates) keep neighbours apart without noise; rebuilding with the same
sources gives the same city.

## Voxel values

Voxel grids are `uint16`:

| Value | Meaning |
| --- | --- |
| `0` | air |
| `1 … 35` | surface classes (table below) |
| `64 + k` | entry *k* of the tile's building table (`BUILDING_BASE = 64`) |

Each building has two entries: `64 + 2i` for its body (top face = roof
colour, side faces = facade, bottom = underside) and `64 + 2i + 1` for the
**steps of its pitched roofs** (side faces in a darker shade of the roof): a
pitched roof voxelises into a staircase, and before this change the risers
took the facade colour, so roofs looked striped from any oblique view
(`voxelize._mark_risers`: the voxels of a column above its lowest
neighbour of the same building, at most 3, when the roof triangle on top is
pitched; towers rising from a flat roof keep their facade).

## The shader byte

Vertex colours are RGBA8. **RGB is an sRGB albedo** (the client converts it to
linear before lighting). **A** packs three fields:

```
alpha = class << 5 | variant << 2 | ao
          3 bits      3 bits       2 bits
```

| Class | Byte | Variants (`variant`) | Client effect |
| --- | --- | --- | --- |
| 0 plain | 0 | 0 plain · 1 lawn · 2 pitch stripes · 3 crop rows · 4 vine rows · 5 paving · 6 ballast · 7 flowers | per-voxel jitter; ground patterns on top faces |
| 1 wall | 32 | window style: 0 residential · 1 old (tall, narrow, 3.4 m storeys) · 2 curtain wall · 3 industrial strips · 4 church slots · 5 none · 6 barn boarding · 7 post-war block (balcony bands) | windows; lit at night (a share per style) |
| 2 roof | 64 | 0 plain · 1 clay tiles · 2 solar panels · 3 green · 4 copper · 5 glass | tile mosaic, panel frames and glints, patchy greens, sky reflection |
| 3 leaves | 96 | 0 broadleaf · 1 conifer | per-tree tint; autumn colours on a share of broadleaf crowns; sway (instanced trees) |
| 4 water | 128 | 0 lake · 1 river/shallow · 2 pool | separate material: ripples, Fresnel, glints, pools glow at night |
| 5 road | 160 | – | worn asphalt; sodium glow and street lamps at night |

`ao` (0–3) is the ambient occlusion of the vertex, [baked by the
mesher](#ambient-occlusion). The variant and occlusion bits are zero in
tiles of format 1, which the client still draws. Patterns are procedural in
world space (no bandwidth) and fade to their average colour once a voxel
covers fewer than about 2–4 screen pixels, so they never shimmer.

## Surface classes

| # | Class | Top | Side | Shader | Typical source |
| --- | --- | --- | --- | --- | --- |
| 1 | soil | `#93714f` | `#86663f` | plain | below every terrain surface, skirts |
| 2 | grass | `#78ae48` | `#65943d` | lawn | parks, gardens, cemeteries; orthophoto "green" where OSM is silent |
| 3 | meadow | `#a4bd5b` | `#8da24e` | lawn | meadows, scrub, orchards, wetlands |
| 4 | forest | `#4b7836` | `#41672f` | plain | forest floor under the canopy |
| 5 | road | `#5a5e67` | `#51555d` | road | minor highways (buffered by width) |
| 6 | major road | `#4f535b` | `#474b52` | road | motorway → secondary |
| 7 | pavement | `#b9b1a3` | `#a59d90` | plain | footways, paved paths, default urban ground |
| 8 | path | `#c9a774` | `#b39266` | plain | unpaved paths and tracks |
| 9 | rail | `#8b8478` | `#7a7369` | ballast | railways, `landuse=railway` |
| 10 | water | `#3a83c2` | `#3474ad` | water | lake 30–160 m from the shore, ponds |
| 11 | sand | `#e6d39b` | `#d1be86` | plain | beaches |
| 12 | rock | `#a19e97` | `#8d8a83` | plain | bare rock, scree, cliffs |
| 13 | parking | `#6b6f77` | `#61656c` | road | surface car parks |
| 14 | pitch | `#4fa64e` | `#47944a` | pitch | sports pitches (mowing stripes) |
| 15 | track | `#c3613f` | `#ad5638` | plain | running tracks |
| 16 | playground | `#dcb987` | `#c7a576` | plain | playgrounds |
| 17 | vineyard | `#86a447` | `#73903e` | vine rows | vineyards (Pully, Lavaux edge) |
| 18 | bridge | `#6a6e76` | `#a8a194` | plain | bridge decks |
| 19 | pillar | `#aca69b` | `#9f998e` | plain | bridge pillars |
| 20 | leaves | `#5c9c3c` | `#4f8834` | leaves (broadleaf) | crowns |
| 21 | dark leaves | `#34603b` | `#2d5434` | leaves (conifer) | conifers, needle-leaf forest |
| 22 | trunk | `#6b4e36` | `#5c432f` | plain | tree trunks |
| 23 | cycleway | `#6a6872` | `#605e67` | road | cycle lanes and paths |
| 24 | plaza | `#c8bda9` | `#b3a895` | paving | pedestrian streets and squares |
| 25 | ripe field | `#d3b965` | `#bba25a` | crop rows | farmland that is yellow in the orthophoto |
| 26 | green field | `#8db753` | `#7a9f49` | crop rows | farmland that is green in the orthophoto |
| 27 | ploughed field | `#9d7b55` | `#896b4a` | crop rows | farmland that is brown in the orthophoto |
| 28 | shallow water | `#4b9fc6` | `#4289ad` | water (river) | lake within 30 m of the shore, rivers |
| 29 | deep water | `#2f6dac` | `#2b6198` | water (lake) | lake more than 160 m from the shore |
| 30 | dirt | `#a68660` | `#917452` | plain | construction sites, brownfields |
| 31 | light leaves | `#79ae47` | `#699a3e` | leaves (broadleaf) | a share of broadleaf crowns and canopy patches |
| 32 | blue conifer | `#2f5648` | `#294c3f` | leaves (conifer) | a share of conifers and needle-leaf patches |
| 33 | pool | `#58c4d8` | `#e3e6e3` | water (pool) | outdoor `leisure=swimming_pool`, fountains |
| 34 | flower bed | `#7f9f45` | `#6d8a3c` | flowers | `landuse=flowerbed` |
| 35 | garden plots | `#8aa552` | `#778f47` | crop rows | allotments, plant nurseries |

Fields get their colour per OSM polygon from the median orthophoto colour
(green crops: a\* < −3; ripe: light and yellow; otherwise ploughed). The lake
is tinted by the distance to the nearest land, measured on a 4 m terrain
raster with 192 m of context so that neighbouring blocks agree (there is no
bathymetry in the sources). Swimming pools are painted after the clean-up of
tiny regions, which would otherwise erase them; indoor and rooftop pools are
skipped.

## Roofs

### Evidence: the 10 cm orthophoto at 0.4 m

SWISSIMAGE 10 cm sheets are cloud-optimised GeoTIFFs (JPEG, 256 px tiles)
with internal overviews at 0.2, 0.4, 0.8 … m. The pipeline reads the 0.4 m
overview of each 1 km sheet with HTTP range requests (≈ 0.3–1 s per sheet,
about 1.4 MB once cached as JPEG) instead of downloading 10 cm data
([`roofs.py`](../../pipelines/geodata/src/geovox/roofs.py)).

Per building, the upward roof triangles are rasterised at 0.4 m (taller
roofs win where roofs overlap), the edge pixels are dropped (the orthophoto
is not a true orthophoto: facades and pavement lean into the roof outline),
then a **robust colour** is estimated: vegetation pixels (overhanging trees,
`ExG > 0.06` and a\* < −3) and deep shadows (L\* < 22) are left out unless
they are the majority, and the **median CIELAB of the brighter 60 %** is
kept — the sunlit faces of a pitched roof carry its colour, the shaded ones
grey it. The shares of vegetation and of solar-panel-like pixels (dark and
blue) are kept too. All inputs cover each building whole, on a grid anchored
to the world origin, so a building crossing two blocks gets the same colour
in both.

### Finding: the photo is hazy, the hue is the signal

At 0.4 m the per-roof median chroma stays low (median C\* 3.8 on the 358
buildings of the Flon block, against 3.9 with the former 2 m centroid
sampling): SWISSIMAGE is desaturated whatever the resolution. What the finer
pixels bring is **purity**: no gutters, shadows, trees or neighbouring
pavement in the sample, so the *hue* becomes reliable (clay tiles: hue
40–75°, C\* 5–17; gravel and membranes: C\* 1–5; copper: hue 160–205°;
panels: dark with b\* < −3). The rule therefore classifies by hue family and
uses lightness only to pick the shade.

### The rule (`roof_family`, `classify_roof`)

`pitched` = share of the upward roof area steeper than ~20°.

1. Majority of vegetation pixels → **green**; majority of panel pixels → **solar**.
2. Chromatic (C\* ≥ 3.2):
   * hue 10–85° (orange to yellow): pitched → **sand** (L\* ≥ 64, C\* < 9),
     **terracotta** (C\* ≥ 6.5 or a\* ≥ 4.5), else **brown**; flat → terracotta
     only when clearly red (C\* ≥ 10, a\* ≥ 5), else sand, brown or gravel;
   * hue 85–160° with C\* ≥ 6 → **green**;
   * hue 160–205° with C\* ≥ 4 → **copper** (L\* ≥ 40) or solar;
   * hue 205–330° → **solar** (L\* < 48) or **metal** (blue-grey sheet, glass);
   * red-pink → terracotta (pitched) or brown.
3. Neutral: dark and clearly blue (L\* < 40, b\* < −3) → solar; pitched →
   **slate** (L\* < 47) or **metal**; flat → slate (L\* < 44), **gravel**
   (< 70) or **membrane**.
4. No usable photo → the shape decides (pitched: mostly terracotta, flat:
   mostly gravel), from a hash of the UUID. OSM `roof:material` /
   `roof:colour` fill in; greenhouses and `roof:material=glass` are **glass**.

Each family has three shades; the photo's L\* plus a deterministic ±4 L\*
jitter per building picks one:

| Family | Light | Mid | Dark | Pattern |
| --- | --- | --- | --- | --- |
| terracotta | `#cc744b` | `#b9613f` | `#9e5037` | tiles |
| brown | `#a2735b` | `#8b5f4b` | `#704c3e` | tiles |
| sand | `#d5b99c` | `#c3a386` | `#ab8b70` | tiles |
| slate | `#5f6570` | `#4e545e` | `#3e434c` | plain |
| metal | `#9aa1a8` | `#868c94` | `#70767e` | plain |
| gravel | `#c1bdb2` | `#aeaaa0` | `#99968d` | plain |
| membrane | `#e7e5df` | `#d9d7cf` | `#cac8c0` | plain |
| green | `#88a35b` | `#718e4d` | `#5b7741` | green |
| copper | `#7ab7a3` | `#60a08c` | `#4d8676` | copper |
| solar | `#40557a` | `#314463` | `#25344d` | solar |
| glass | `#c7d7db` | `#b2c5cb` | `#9fb4bb` | glass |

### Distribution in Lausanne

Every building of the municipality (7 876 with their centre inside it, all
with enough roof pixels for a sample), the former rule (ADR 0017: 2 m
product sampled at the roof triangles' centroids) against this one:

| Family | Before | After |
| --- | --- | --- |
| terracotta | 21.4 % | 20.5 % |
| brown | 25.5 % | 19.0 % |
| sand | – | 1.1 % |
| slate | 4.6 % | 1.9 % |
| metal | 15.2 % | 18.0 % |
| gravel | 17.4 % | 23.4 % |
| membrane | 8.1 % | 7.1 % |
| green | 7.6 % | 5.5 % |
| copper | 0.2 % | 0.5 % |
| solar panels | – | 2.6 % |
| glass | – | 0.4 % |

The shares hardly move, but **only 46 % of the roofs keep their family**.
The former "brown" caught every pitched roof that was neither grey nor
clearly red at 2 m: 550 of them are neutral grey in the 0.4 m photo (now
metal) and 529 clearly clay (terracotta); 470 former "metal" roofs read as
gravel, 454 former clay roofs as duller brown tiles, and 179 former "green"
flat roofs are gravel once the vegetation pixels (most likely overhanging
trees) are dropped. In the old
town (Cité and Palud, 84 buildings) clay stays the majority (44 % → 43 %)
and gravel grows (17 % → 24 %). The rule was calibrated on roofs of the Flon
and Cité blocks checked one by one against the photo (the samples pinned in
the tests); solar panels (2.6 %) and sand-coloured tiles are new families
that the 2 m sampling could not see.

## Facades

The orthophoto cannot see facades. They come from what is known about each
building ([`gwr.py`](../../pipelines/geodata/src/geovox/gwr.py), `facade_style`):

1. **OSM** `building:colour` (snapped to the nearest palette colour in
   CIELAB) or `building:material` (glass, metal, brick, wood, stone) when
   mapped (rare: 68 colours and 13 materials on 43 624 buildings).
2. **swissBUILDINGS3D type**: churches, chapels and church towers → stone
   with church windows; storage tanks, greenhouses, buildings under
   construction, walls, chimneys, open sheds and canopies → their own
   palettes, without windows.
3. **Federal building register** (GWR): the construction year (or the
   middle of its period) and the building class. Classes first: listed
   monuments → stone; industry, warehouses, transport, sports halls →
   industrial claddings; garages → the same claddings without windows; farm
   buildings → wooden barns; offices and shops built after 1970 → glass and
   metal. Otherwise the era:

| Palette | Era | Colours | Windows |
| --- | --- | --- | --- |
| old | before 1919 | molasse grey-green and beige, cream, ochre, pale yellow, salmon, pale stone, ochre sandstone | tall and narrow |
| interwar | 1919–1945 | cream, beige, light ochre, pale salmon, travertine | residential |
| postwar | 1946–1970 | light concrete, white render, pale grey-green, pale yellow, greige, pale blue-grey | blocks (balcony bands) for housing, schools, hospitals |
| late | 1971–2000 | concrete, off-white, brown and sand claddings | residential, blocks until 1990 |
| recent | 2001 on | white, light greys, a few anthracite and timber facades | residential |
| glass | offices, shops ≥ 1971 | blue-grey glass, silver | curtain walls |
| industrial | industry, depots, sports halls | metal greys, beige cladding, white panels | high strips |
| stone | churches, monuments | molasse, sandstone, limestone | church slots / old |
| barn | farm buildings | timber browns, white render | boarding |

4. No register entry (3.8 % of the agglomeration's buildings, 5.2 % in
   Lausanne): the roof hints at the era — tiled roofs give *old* or
   *interwar*, other roofs *postwar* or *late*.

The register has no EGID link to swissBUILDINGS3D in Vaud, so its points
(GKODE/GKODN) are joined to the footprint they fall in, or to the nearest
footprint within 3 m; where several entries share a solid, the largest
(ground area) describes it. The colour inside a palette is a hash of the
UUID; the window style travels in the wall's variant bits.

## Ambient occlusion

The mesher bakes the usual voxel ambient occlusion into the vertex alpha
(two sides and the diagonal around each corner, in the layer in front of
the face; [`mesh.py`](../../pipelines/geodata/src/geovox/mesh.py)):

* building faces are darkened by anything solid; for walls only what stands
  in front of their **foot** (the ground, a lower roof) and what hangs over
  their **top** (eaves) counts, so a facade on a slope is not cut into
  strips at every terrain step;
* ground faces are darkened by buildings and bridges only (the contact
  shadow along the foot of walls), not by terrain steps;
* the steps of pitched roofs darken nothing (roofs would turn striped).

The four corner values are part of the greedy merge key, so only faces with
the same pattern merge. It is baked on **levels 0 and 1** only
(`config.AO_LEVELS`): at 4–8 m voxels the gradient would only smear, and
the outline pass of the client gives distant views their depth. Measured
on the Flon demo: quads +36 % (level 0), +27 % (level 1), +4–5 % (levels 2–3,
from the colour variety); served bytes 9.35 → 12.07 MB for the tiles
(+29 %). The client darkens occlusion towards a cool blue-grey, stronger at
1 m than at 2 m.

## Trees

Level 0 trees are instanced prefabs (broadleaf in `leaves`, conifers in
`dark leaves`); the client tints each instance (a hash of its position):
broadleaf between yellow-green and blue-green, conifers between blue-green and
dark green. On levels 1–3, stamped trees take one of two shades per kind
from a coordinate hash, and forest canopies are a mosaic of 12 m patches
anchored to the world (broadleaf: two greens; needle-leaf: dark and blue-green;
mixed forests: both), so every level agrees.

Autumn is the client's: from late September a share of broadleaf crowns
turns yellow, orange or rust, most in early November, back to green by
mid-December (`lib/world/sun.ts`, `autumn()`).

## Tests

[`tests/test_materials.py`](../../pipelines/geodata/tests/test_materials.py)
(shader byte, palettes, roof families on measured CIELAB samples, facade
eras and types, OSM colours), [`test_roofs.py`](../../pipelines/geodata/tests/test_roofs.py)
(rasterisation, robust samples, mosaics, the colour window),
[`test_gwr.py`](../../pipelines/geodata/tests/test_gwr.py) (register parsing
and join), [`test_landcover.py`](../../pipelines/geodata/tests/test_landcover.py)
(fields, pools, shore distance, crown shades),
[`test_mesh.py`](../../pipelines/geodata/tests/test_mesh.py) (ambient
occlusion) and [`test_voxelize.py`](../../pipelines/geodata/tests/test_voxelize.py)
(roof steps); in the client [`materials.test.ts`](../../apps/web/src/lib/world/__tests__/materials.test.ts)
decodes the shader byte and checks that the shader patches apply.
