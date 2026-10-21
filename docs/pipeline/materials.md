# Materials and colours

Source of truth: [`geovox/materials.py`](../../pipelines/geodata/src/geovox/materials.py)
(pipeline) and [`apps/web/src/lib/world/materials.ts`](../../apps/web/src/lib/world/materials.ts)
(shaders). The two files must agree on the shader classes.

## Voxel values

Voxel grids are `uint16`:

| Value | Meaning |
| --- | --- |
| `0` | air |
| `1 … 24` | surface classes (table below) |
| `32 + k` | the *k*-th building of the tile (`BUILDING_BASE = 32`); its colours come from the tile's building table |

Each emitted face is coloured from `(value, face direction)`: a **top**
colour, a **side** colour and a **bottom** colour (side × 0.82). The colour
is written to `COLOR_0.rgb`, the **shader class** to `COLOR_0.a`.

## Surface classes

| # | Class | Top | Side | Shader | Typical source |
| --- | --- | --- | --- | --- | --- |
| 1 | soil | `#8d6e4f` | `#7b5d41` | plain | below every terrain surface, skirts |
| 2 | grass | `#7cb352` | `#6b9a45` | plain | parks, gardens, cemeteries; orthophoto "green" where OSM is silent |
| 3 | meadow | `#a3c062` | `#8ea752` | plain | farmland, meadows, scrub, orchards |
| 4 | forest | `#557f3e` | `#4a6e36` | plain | `landuse=forest`, `natural=wood` (floor under the canopy) |
| 5 | road | `#5f636b` | `#565a61` | road | minor highways (buffered by width) |
| 6 | major road | `#54585f` | `#4c5056` | road | motorway → secondary |
| 7 | pavement | `#bdb6a9` | `#a9a296` | plain | footways, paved paths, default urban ground |
| 8 | path | `#c8ab7d` | `#b2966b` | plain | unpaved paths and tracks |
| 9 | rail | `#83756a` | `#74675d` | plain | railways, `landuse=railway` |
| 10 | water | `#3f86c6` | `#3a79b2` | water | lake (from the terrain model), rivers, ponds |
| 11 | sand | `#e2d19a` | `#cfbd86` | plain | beaches |
| 12 | rock | `#9d9b95` | `#8a8882` | plain | bare rock, scree, cliffs |
| 13 | parking | `#71757c` | `#65696f` | plain | surface car parks |
| 14 | pitch | `#5eaa58` | `#55984f` | plain | sports pitches |
| 15 | track | `#c4674c` | `#ae5b43` | plain | running tracks |
| 16 | playground | `#d9b98e` | `#c4a67c` | plain | playgrounds |
| 17 | vineyard | `#8fa851` | `#7a8f46` | plain | Lavaux-style terraces |
| 18 | bridge | `#686c73` | `#a39d93` | plain | bridge decks |
| 19 | pillar | `#aaa49a` | `#9d978d` | plain | bridge pillars |
| 20 | leaves | `#5c9a3e` | `#4f8735` | leaves | tree crowns |
| 21 | dark leaves | `#3f6f3a` | `#365f32` | leaves | conifers, crown shading |
| 22 | trunk | `#6e5038` | `#5f4430` | plain | tree trunks |
| 23 | cycleway | `#6c6a73` | `#605e66` | road | cycle lanes and paths |
| 24 | plaza | `#cfc6b6` | `#bbb2a2` | plain | pedestrian streets and squares |

The palette is muted on purpose: saturated colours are reserved for the halal
markers and the interface's single primary action ([design system](../design/design-system.md)).

## Shader classes

The alpha byte tells the voxel shader which procedural detail to add. Nothing
here costs bandwidth: it is computed per pixel in world space, so it is
identical across levels of detail.

| Alpha | Class | Effect in the client |
| --- | --- | --- |
| 0 | plain | per-voxel brightness jitter (every class gets it: ×0.955–1.03 from a hash of the voxel cell) |
| 32 | wall | windows on vertical faces: 3 m storeys × 2.5 m bays, anti-aliased with `fwidth`, faded out between 900 m and 2.2 km; at night about 58 % of them glow warm |
| 64 | roof | a second, finer jitter so large flat roofs do not look plastic |
| 96 | leaves | per-tree warm/cool tint; instanced trees sway gently (amplitude grows with height; disabled with reduced motion) |
| 128 | water | separate material: moving ripples, Fresnel blend to the sky colour, sun glints; ripples and glints fade out between 250 m and 900 m (far away they aliased into a grid of white dots) |
| 160 | road | a light jitter that reads as worn asphalt |

## Buildings

Each building of swissBUILDINGS3D gets three colours: roof (top faces), wall
(side faces) and underside (wall × 0.72).

**Walls** come from a palette inspired by Lausanne's molasse sandstone,
plaster and concrete (10 colours: cream plaster, warm beige, molasse
sandstone, greige, off-white, pale stone, ochre sandstone, light concrete,
sand, rosy beige). Industrial and open buildings (`OBJEKTART` containing
"Industrie" or "Offenes") use three concrete greys. The choice is a
deterministic hash of the building's UUID (`stable_unit`), so a building keeps
its colour across levels of detail and across rebuilds.

**Roofs** are classified from the orthophoto *and* the roof shape.

### Why roof shape matters (finding)

The first version snapped the median SWISSIMAGE colour under each roof to the
nearest palette colour in CIELAB. The city came out grey. Measuring the
4 366 buildings of the Flon block showed why:

| Measure (Flon block, 4 366 buildings) | Value |
| --- | --- |
| median CIELAB chroma of roof samples | **4.9** (p90: 10.9) |
| median lightness L* | 53.9 |
| roofs with ≥ 50 % of their area pitched | 52.7 % |
| nearest-colour rule: grey family / tile family | **83 % / 16 %** |
| shape-aware rule: grey family / tile family | **49 % / 44 %** (+7 % green and copper) |

At 2 m per pixel, clay tiles are hazy, shadowed and mixed with gutters and
skylights, so their colour is nearly neutral. Roof *shape* is a far better
prior: in Lausanne, pitched roofs are mostly clay tiles, flat roofs mostly
gravel, membranes or greenery.

A second finding: the solids are **not consistently wound** (some are
inside-out), so normals computed from the triangles pointed down on part of
the city. Each solid is now oriented with the sign of its volume before its
roof normals are read ([voxelization](voxelization.md#2-preparing-a-block-one-per-root-tile)).

### The rule (`snap_roof_color`)

`pitched` = share of the upward-facing roof area whose normal has
`0.35 < n_z < 0.94` (steeper than about 20°). The orthophoto colour is
brightened by 10 % (orthophotos are darker and hazier than the stylised
palette) and converted to CIELAB (L*, a*, b*, chroma, hue).

1. Hue 150–260° with chroma ≥ 7 → **copper patina** `#5f8f86` (cathedral, churches).
2. Pitched (`pitched ≥ 0.5`):
   * chroma < 3 → slate/zinc: `#5a5d63` if L* < 48, else `#7f8287`
   * a* ≥ 2.5 → terracotta: `#b35a3f` if L* ≥ 50, else `#9a4e3a`
   * a* ≥ 0.5 → `#7d5a4d` (brown tiles) if L* < 50, else `#a85e45` (faded terracotta)
   * otherwise → `#8a6f5c` (weathered tiles)
3. Flat:
   * hue 95–150° with chroma ≥ 8 → **green roof** `#6f8e57`
   * L* < 46 → `#5a5d63`; < 56 → `#7f8287`; < 68 → `#a3a49f` (gravel/concrete); else `#c4c0b6` (light membrane)
4. No orthophoto sample → a deterministic pick in the tile family (pitched) or
   flat family.

Tests: [`tests/test_materials.py`](../../pipelines/geodata/tests/test_materials.py)
pin the copper, terracotta, slate, green and fallback branches.
