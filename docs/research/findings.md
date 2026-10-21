# Findings

Things learned while building, each with its consequence. Most were found by
measuring or by a failing test; the fix is in the code and, where it is a
decision, in an ADR.

## Geodata

| # | Finding | Consequence |
| --- | --- | --- |
| 1 | swissBUILDINGS3D `Building_solid` geometries are **not consistently wound**: part of them are inside-out. | Each solid is oriented with the sign of its volume before normals are read ([materials](../pipeline/materials.md)). |
| 2 | Orthophoto samples of roofs are nearly neutral at 2 m (median CIELAB chroma **4.9** on 4 366 Flon buildings); nearest-colour matching gave **83 % grey** roofs. | Roof shape (share of pitched area) became the prior; the photo picks the shade ([ADR 0017](../decisions/0017-roof-colours-from-roof-shape.md)). |
| 3 | A regional OSM extract **cannot assemble the Lake Geneva multipolygon** (it spans France and Geneva); the first builds had no lake. | The lake comes from the terrain model, which stores it flat at ~372.13 m ([ADR 0007](../decisions/0007-lake-from-the-terrain-model.md)). |
| 4 | The swissBOUNDARIES3D municipality polygon **includes Lausanne's share of the lake** (67.63 km² vs **41.36 km²** of land), and OSM only yielded ponds to subtract, so 9 % of level 0–1 tiles were open water. | The detailed region subtracts the open lake detected in the terrain model and is clipped to the detail box: 6 814 → **6 482** tiles; the computed land area matches the official 41.37 km². |
| 5 | GEOS (Shapely) cannot represent `TIN Z` geometries from the File Geodatabase. | Triangles are parsed straight from WKB after an `ogr2ogr` conversion to GeoPackage. |
| 6 | swissTLM3D is only distributed as one national archive per edition (**4.8 GB** zipped GeoPackage). | OpenStreetMap is the surface source ([ADR 0005](../decisions/0005-openstreetmap-for-surfaces.md)). |
| 7 | The GeoAdmin SearchServer returns `x` = northing, `y` = easting. | The geocoder swaps them; a unit test pins it. |
| 8 | Rounding heights to voxel levels leaves single-voxel islands along x.5 m contours; per-pixel orthophoto classes make noisy, heavy meshes. | Small regions are merged after quantisation; the orthophoto base is mode-filtered. |
| 9 | Forests stamped tree by tree at 4–8 m voxels look like noise and mesh badly. | Dense forest becomes one canopy volume on levels 1–3; instanced trees on level 0 ([ADR 0006](../decisions/0006-trees-from-the-surface-model.md)). |

## Rendering and streaming

| # | Finding | Consequence |
| --- | --- | --- |
| 10 | Water ripples and glints alias into a grid of white dots far from the camera. | They fade out between 250 m and 900 m. |
| 11 | GLSL reserves identifiers starting with `gl_`: a shader helper named `gl_hash13` failed to compile ("reserved built-in name"). | Renamed `vxHash13`. |
| 12 | drei's `<Html>` owns its own React root; unmounting it during a render (React 19) caused `removeChild` errors and half-closed dialogs. | Name tags stay mounted, only their text changes; positions update in the frame loop. |
| 13 | drei's `<AdaptiveDpr>` does nothing unless something calls `performance.regress()`; nothing did. | Removed. |
| 14 | A `PerformanceMonitor` quality step recreated the tile store, so the whole city reloaded on slow devices. | Quality changes now adjust budget and concurrency in place (`TileStore.setLimits`). |
| 15 | `PerformanceMonitor` would read the sparse frames of on-demand rendering as a slow device. | It is unmounted while a modal covers the map. |
| 16 | The full municipality's first view (desktop, high quality) needs 144 tiles, 10.3 MB and 107 MB of GPU geometry; a low-end phone 72 tiles, 5.4 MB, 56 MB. | Budgets of 400/220/120 MB leave headroom ([performance](../operations/performance.md)). |

## Platform and libraries

| # | Finding | Consequence |
| --- | --- | --- |
| 17 | Next.js 16: `next/root-params` only exposes the **root** layout's params ("Export locale doesn't exist"). | `app/[locale]/layout.tsx` is the root layout; `global-not-found` for the rest ([ADR 0019](../decisions/0019-root-layout-under-locale.md)). |
| 18 | Next.js 16 renamed `middleware` to `proxy`; nonce-based CSP is incompatible with Cache Components' static shell; `tsc` needs `next typegen` first. | `src/proxy.ts`; CSP without nonces (`'wasm-unsafe-eval'` for meshopt); `typecheck` script runs typegen. |
| 19 | Base UI drawers: swapping the desktop panel for the mobile sheet after hydration opened the sheet at full height. | The media-query hook returns `null` until hydrated; drawers render only once the layout is known. |
| 20 | Base UI `RadioGroup` inside one `Field`: every radio was named after the first card's label. | `Field.Item` per option (caught by an end-to-end test). |
| 21 | A Base UI drawer is named by its `Drawer.Title`; an extra `aria-label` overrode the spot's name. | `aria-label` removed; tests look panels up by the spot's name. |
| 22 | Cloudflare Pages **joins** the values of every `_headers` rule matching a path. | `Cache-Control` is set per path, never on `/*` ([ADR 0004](../decisions/0004-tile-hosting.md)). |
| 23 | Supabase's built-in mailer only sends to project team members, 2 messages per hour. | Free SMTP provider required for launch ([deployment](../operations/deployment.md#e-mail-for-sign-in-links)). |
| 24 | The sign-in callback is locale-prefixed with a query string; exact redirect URLs do not match it. | Redirect allow-lists use `/**` globs (local config fixed). |
| 25 | Supabase free projects pause after 7 days without requests. | Documented in the runbook. |

## Testing and CI

| # | Finding | Consequence |
| --- | --- | --- |
| 26 | The CI database job connects as the runner's own superuser, which the profile guard did not recognise (`forbidden` before any test ran). | Superusers are exempt (they bypass RLS anyway). |
| 27 | On a 2-core runner, SwiftShader rendering the city every frame starved the page: a dialog could take > 15 s to close, and two browsers in parallel missed the 60 s first-view budget. | The city renders on demand while a modal covers it (resuming after the exit transition); CI runs one browser at a time; long dialog flows are `test.slow()`. Reproduced locally with `taskset -c 0,1`. |
| 28 | Dependabot proposed TypeScript 7, ESLint 10 and @types/node 26 (majors, failing CI). | npm majors are ignored by Dependabot and upgraded by hand. |
| 29 | A test typed into the search box before React had hydrated: the text never reached state (1 run in 20 failed on two cores). | Tests wait for the client-only canvas before typing (`waitForInteractive`); 20/20 pass. |

## Repository hygiene

| # | Finding | Consequence |
| --- | --- | --- |
| 30 | `motion` and `@supabase/ssr` were dependencies but never imported. | Removed. |
| 31 | `apps/web/.gitignore` ignored every `.env*`, including the example file. | `!.env.example`; the example documents every variable. |
| 32 | The project declared MIT everywhere but had no `LICENSE` file. | Added. |
| 33 | French and English message files were kept in sync by hand. | A unit test now checks keys, placeholders and rich-text tags. |
