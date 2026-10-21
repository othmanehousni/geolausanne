# Licences and attribution

This page explains what the project may do with the data and code it uses,
and what it must do in return. It is not legal advice; the original licence
texts prevail.

## The project's own code

MIT ([`LICENSE`](../../LICENSE)), as stated in `package.json`,
`pyproject.toml` and the terms of use. Generated city tiles and the places
database are covered below, not by the MIT licence.

## Geodata

### swisstopo (Federal Office of Topography)

swissALTI3D, swissSURFACE3D, SWISSIMAGE, swissBUILDINGS3D 3.0 Beta,
swissBOUNDARIES3D, swissALTIRegio, and the GeoAdmin API (search,
identify on the federal building register).

* Open government data since 2021: free of charge, commercial use allowed,
  under swisstopo's terms of use for free geodata and geoservices.
* **Obligation: name the source**, "© swisstopo" (or "Source: Federal Office
  of Topography swisstopo").
* Where we do it: the map's attribution line ("Geodata © swisstopo"), the
  about page's sources table, the manifest's `sources` and `attribution`
  fields, the terms of use.

### OpenStreetMap

Roads, paths, rails, water, land use, bridges and leaf types in the city, and
the halal places in the seed.

* Licence: **Open Database License 1.0** (ODbL), © OpenStreetMap
  contributors.
* **The 3D city is a Produced Work** (geometry rendered from the database):
  it must carry the attribution "© OpenStreetMap contributors" wherever it is
  shown. The map's attribution line, the about page, the manifest and the
  terms do this.
* **The places database is a Derivative Database** as soon as it contains
  OpenStreetMap rows (the seed: `source = 'osm'`, with `osm_id`), and the
  community facts are added to it. Because the site publicly uses it, the
  ODbL requires that the database (or the changes) be **made available under
  the ODbL**. The terms of use therefore publish the facts people add
  (name, location, category, hours, halal level…) under the ODbL, while
  reviews stay their authors' content.
  * Practical step: provide an export of the `places` facts on request (or
    publish one periodically), **without personal data**: drop
    `created_by`, keep `source` and `osm_id`.
* The seed generator (`python -m geovox seed-places`) writes the extract's
  timestamp and the attribution into `supabase/seed.sql`.
* Contributing back: corrections found by the community (closed places, wrong
  positions) can be reported to OpenStreetMap by any mapper; the project does
  not import community data into OSM automatically (the ODbL and the OSM
  import guidelines require care and consent).

## Fonts and icons

| Asset | Licence |
| --- | --- |
| Atkinson Hyperlegible Next | SIL Open Font License 1.1 |
| Pixelify Sans | SIL Open Font License 1.1 |
| Phosphor Icons | MIT |

Fonts are downloaded at build time by `next/font` and served from our own
origin.

## Libraries

All runtime dependencies use permissive licences:

* Web: Next.js, React, three.js, React Three Fiber, drei, three-mesh-bvh,
  Base UI, shadcn (copied components), Tailwind CSS, tw-animate-css,
  class-variance-authority, cn, NumberFlow, next-intl, TanStack Query,
  zustand, supabase-js, meshoptimizer: **MIT**. Phosphor Icons: MIT.
* Pipeline: numpy, scipy, numba, rasterio, shapely (BSD), pyogrio, pyproj
  (MIT). GDAL (MIT/X) and osmium-tool (GPL-3.0) are used as command-line
  tools at build time and are not distributed.

## Component inspiration

The UI survey ([research](../research/ui-component-survey.md)) looked at
eleven component sites. No code from paid ("Pro") collections was viewed or
copied: the vote control re-implements the *behaviour* of Bencho's Pro
feedback bar from a written description. No code under the Commons Clause
(React Bits, Rare UI) or without a licence (some portfolio prototypes) is
included. MIT components that inspired ours (beUI) were not copied either:
our versions are built on Base UI.

## Names and logos

Halal certifiers are shown by name (text) when people enter them; no
certifier logos are displayed. Business names come from OpenStreetMap or from
contributors.

## Services

Vercel (Hobby: personal, non-commercial use), Cloudflare (Pages, Turnstile),
Supabase, the chosen SMTP provider and optional OAuth providers each have
terms the operator accepts when creating the accounts; see
[ADR 0018](../decisions/0018-free-tier-only.md) for the constraints that
matter (non-commercial use, inactivity pause).
