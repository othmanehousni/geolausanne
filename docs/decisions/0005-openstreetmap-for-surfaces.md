# 0005. OpenStreetMap instead of swissTLM3D for surfaces

Status: accepted · Date: 2026-10-21

## Context

Every square metre of ground needs a class (road, pavement, grass, water,
rail, …). The blueprint proposed swissTLM3D (swisstopo's topographic
landscape model) enriched with OpenStreetMap. The pipeline must run on a
laptop and on a free GitHub runner (14 GB of disk after cleanup).

## Decision

Use **OpenStreetMap only** for vector surfaces: roads and paths (buffered by
`width` or typical widths), rails, rivers, land use, leisure areas, pedestrian
areas (`area:highway`, `place=square`), parking, bridges (`bridge`, `layer`),
leaf types; the canton of Vaud extract from openstreetmap.fr (63 MB),
clipped with osmium. Where OSM says nothing, the **orthophoto** decides
between grass, asphalt and pavement. The lake comes from the terrain model
([0007](0007-lake-from-the-terrain-model.md)).

## Alternatives

* **swissTLM3D**: authoritative and consistent, but distributed only as one
  national archive per edition (the 2026-02 GeoPackage is **4.8 GB zipped**),
  with no tiling or bounding-box download. Extracting Lausanne would mean
  downloading and unpacking ~5 GB per CI run (or caching it), for data that
  is coarser than OSM in the city centre: it has no pedestrian-area polygons,
  no surface materials, no parking or playground areas comparable to OSM's.
* **Both** (TLM for roads, OSM for the rest): two classification schemes to
  reconcile at every boundary for little visible gain at 1 m voxels.
* **Orthophoto segmentation alone**: noisy at 2 m (shadows, cars, trees over
  roads) and no semantics (a footpath and a road look alike).

## Consequences

* The look of the city depends on OSM quality, which is very good in
  Lausanne; improvements by the OSM community flow in at the next build.
* OSM is ODbL: the generated city is a "produced work" that must carry the
  attribution ([licensing](../legal/data-licensing.md)).
* One source for both the city and the halal seed places (`diet:halal`).
