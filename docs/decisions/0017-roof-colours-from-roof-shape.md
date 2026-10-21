# 0017. Roof colours from roof shape plus orthophoto

Status: superseded by [0025](0025-colour-model-from-open-data.md) · Date: 2026-10-21

## Context

From above, a city is mostly roofs. The first builds snapped the median
orthophoto colour under each roof to the nearest palette colour, and
Lausanne came out grey, although its old town is a sea of clay tiles.
Measurements on the 4 366 buildings of the Flon block: median CIELAB chroma
of the samples 4.9 (nearly neutral), 52.7 % of roofs mostly pitched, and the
nearest-colour rule produced 83 % grey roofs and 16 % tile colours.

At the same time, part of the swissBUILDINGS3D solids turned out to be
inside-out (inconsistent winding), so roof normals computed from triangles
were sometimes reversed.

## Decision

* Orient every solid outwards with the sign of its volume before reading
  normals.
* Compute `pitched`, the share of upward roof area steeper than ~20°.
* Use roof shape as the prior: pitched roofs pick among clay-tile, brown,
  slate and zinc shades; flat roofs among gravel, membranes, metal and green
  roofs; the orthophoto colour (brightened 10 %, in CIELAB) chooses the shade
  within the family; strong blue-green hues are copper patina (cathedral and
  churches). Rules in the materials page of that time (replaced by [ADR 0025](0025-colour-model-from-open-data.md)).
* Deterministic fallbacks per building UUID where no sample exists.

## Alternatives

* Nearest colour in RGB or CIELAB: the measured result (83 % grey).
* Classifying from the 10 cm orthophoto: 400 times more data to download for
  a few hundred thousand roofs, and shadows remain.
* Random tile/flat colours by building type: ignores real green roofs and
  copper.

## Consequences

* Flon block: 49 % grey-family and 44 % tile-family roofs (+7 % green and
  copper), matching what one sees from the cathedral tower.
* Tests pin each branch of the rule (`tests/test_materials.py`).
