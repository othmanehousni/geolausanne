# 0013. swisstopo GeoAdmin API for search and addresses

Status: accepted · Date: 2026-10-21

## Context

Search must find community spots and also streets, places, neighbourhoods,
municipalities and postcodes ("Rue Centrale", "Ouchy", "1004"). When someone
adds a spot, the form should suggest the address of the picked location.
Everything must be free and should work with LV95 coordinates.

## Decision

* **Search**: the GeoAdmin SearchServer
  (`api3.geo.admin.ch/rest/services/api/SearchServer`, `type=locations`,
  origins `address`, `gazetteer`, `gg25` (municipalities) and `zipcode`,
  limited to a box around Lausanne, in the interface language). Results are
  merged with community spots from `search_places` in one Base UI
  Autocomplete with two groups.
* **Reverse geocoding**: an `identify` request on the federal building and
  dwelling register (`ch.bfs.gebaeude_wohnungs_register`) near the picked
  point returns the nearest official address ("Rue Centrale 31, 1003
  Lausanne").
* Requests start at two characters, are debounced and aborted when the query
  changes; results are deduplicated; HTML in labels is decoded safely.

## Alternatives

* **Nominatim (OSM)**: the public instance's usage policy forbids
  autocomplete-style querying and heavy use.
* **Photon** (komoot's public instance): no service guarantee; OSM addresses
  are less complete than the federal register.
* **Mapbox, Google, HERE**: API keys, quotas and costs.
* **Searching only our own database**: no streets or neighbourhoods.

## Consequences

* Swiss official data: addresses match what people see on street signs.
* Typed search text and picked coordinates are sent to swisstopo (stated in
  the privacy policy); no personal data is attached.
* The SearchServer returns `x` = northing and `y` = easting (historical
  Swiss axis order); the geocoder swaps them and a unit test pins it.
* Results in neighbouring municipalities are shown too; choosing one flies
  there and says that it lies outside the detailed 3D city.
