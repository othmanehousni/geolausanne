# Architecture

GeoLausanne has two worlds that never mix, exactly as the blueprint proposed:

* the **static world**: terrain, buildings, streets, trees, the lake. It is
  generated offline by the pipeline and served as immutable files. It changes
  only when the city is rebuilt.
* the **dynamic world**: halal spots, votes, reviews, reports. It lives in the
  database and changes every minute. When someone confirms a restaurant, its
  marker updates; the 3D city does not.

```
                       offline (laptop or GitHub Actions)
  swisstopo STAC ─┐
  OSM Vaud extract├──► pipelines/geodata (geovox, Python) ──► GLB quadtree + manifest
  swissALTIRegio ─┘                                  │       (meshopt + gzip)
                                                     ▼
                                     Cloudflare Pages (static, immutable, CORS)
                                                     │  tiles: /lodN/i_j.glb?v=<version>
  ┌──────────────────────────── browser ─────────────┼──────────────────────────────────┐
  │ Next.js 16 app (static HTML, React 19)           │                                  │
  │  ├─ UI layer: Base UI / shadcn, next-intl, zustand, TanStack Query                  │
  │  ├─ R3F canvas: CityTiles (LOD + streaming) ◄── worker pool (fetch, gunzip, meshopt)│
  │  │              Horizon, Life, PlaceMarkers, CameraRig, Atmosphere                 │
  │  └─ Repository ──► SupabaseRepository ──► PostgREST RPCs (RLS)  │  DemoRepository   │
  └───────────────┬────────────────────────────────┬───────────────────────────────────┘
                  │ HTML/JS (Vercel)                │ HTTPS + JWT
                  ▼                                 ▼
          Vercel (Hobby)                 Supabase (Postgres + PostGIS, Auth, pg_cron)
                                         swisstopo GeoAdmin API (search, reverse geocoding)
```

| Page | Contents |
| --- | --- |
| [frontend.md](frontend.md) | the Next.js app: routes, i18n, state, data layer, components, errors, SEO, security headers |
| [streaming-and-lod.md](streaming-and-lod.md) | how tiles are chosen, loaded, cached and evicted |
| [rendering.md](rendering.md) | canvas, camera, materials, atmosphere, horizon, markers, picking |
| [../pipeline/README.md](../pipeline/README.md) | how the static world is built |
| [../backend/data-model.md](../backend/data-model.md) | how the dynamic world is stored and protected |

## Repository layout

```
apps/web/                 Next.js app (the only deployable)
  src/app/[locale]/       routes (root layout lives here, see ADR 0019)
  src/components/         map/, place/, world/ (R3F), auth/, moderation/, form/, layout/, ui/ (shadcn on Base UI)
  src/lib/world/          LOD selection, tile store, worker, decoder, materials, picking, navigation
  src/lib/data/           Repository contract, Supabase + demo implementations, query hooks, rules
  src/lib/geo/            swisstopo geocoder
  src/stores/             zustand stores (world, ui, places, announcer)
  messages/               fr.json, en.json
  e2e/                    Playwright + axe tests
  public/city/flon/       committed demo city (11 MB)
packages/geo-types/       LV95/WGS84 transforms, tile maths, manifest schema (shared, tested against PostGIS)
pipelines/geodata/        geovox: Python pipeline, meshopt compressor, CDN headers
supabase/                 migrations, seed, pgTAP tests, local config
scripts/test-db.sh        runs migrations + pgTAP on plain PostgreSQL
.github/workflows/        ci.yml (every push), city.yml and database.yml (manual deployments)
docs/                     this documentation
```

## Life of a few interactions

**Opening the site.** `/` is redirected by the proxy to `/fr` or `/en`
(cookie, then `Accept-Language`). The page is static HTML; the 3D canvas
loads client-side, fetches `manifest.json`, draws the root tiles (level 3)
in view, then refines towards the camera. Places in the area around the camera
are fetched with `places_in_bbox` and drawn as pixel badges
([rendering](rendering.md#place-markers)).

**Tapping a badge.** The badge under the finger is found in screen space and
its place id goes into the UI store; the place panel
(a Base UI drawer: side panel on desktop, bottom sheet on phones) opens with
`place_detail`, the vote control and reviews. The URL gets `?spot=<id>` so
the view can be shared.

**Adding a spot.** "Add spot" (signed in) enters placement mode: tap the map,
use the map centre, or "my location". The picked world point becomes LV95,
then WGS84; swisstopo's building register suggests the address; nearby
existing spots are listed to avoid duplicates; `create_place` validates
everything again on the server.

**Downvoting a wrong spot.** `cast_vote(id, -1)` updates the counters
through a trigger; if the spot now has ≥ 5 downvotes and a score ≤ −5 it is
removed in the same transaction, the RPC returns `status = removed`, a toast
confirms it (the new score is announced to screen readers) and the pin
disappears for everyone.
