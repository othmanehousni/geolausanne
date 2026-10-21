# 0007. Take Lake Geneva from the terrain model

Status: accepted · Date: 2026-10-21

## Context

The first full builds had no lake: the shore of Ouchy ended in a flat field
at 372 m. Investigation showed that a regional OpenStreetMap extract cannot
assemble the Lake Geneva multipolygon, whose outline runs through France and
the canton of Geneva, so the lake relation is dropped by the extract or the
converter.

## Decision

swissALTI3D stores the lake as a flat surface at about **372.13 m**. During
block preparation, connected regions within 0.55 m of the 372 m lake level
and larger than 5 000 m² (after a morphological opening) are classified as
water; in tiles, lake cells get exactly the lake level (world `y = 0`). Rivers
and ponds still come from OSM. The horizon does the same on swissALTIRegio
(flat cells within 2.5 m of the lake level).

## Alternatives

* Downloading the lake polygon separately (OSM relation or swissTLM3D): extra
  source and download for one feature.
* Hard-coding a shoreline: brittle, and it would disagree with the terrain.

## Consequences

* The shoreline matches the terrain model exactly, so quays and beaches meet
  the water without gaps or steps.
* The lake is also removed from the detailed region of the municipality
  (levels 0–1), which saves thousands of flat water tiles.
