# GeoLausanne

[![CI](https://github.com/othmanehousni/geolausanne/actions/workflows/ci.yml/badge.svg)](https://github.com/othmanehousni/geolausanne/actions/workflows/ci.yml)

A voxel 3D Lausanne where the community maps **halal food**. Explore
Lausanne and its 15 neighbouring towns block by block, find spots, add the
ones you know, vote on them (a spot that enough people judge wrong is
removed), review them and say how you checked the halal status.

![Lausanne as a voxel city, looking north over the railway and the Flon towards the old town, with halal spots as small saffron badges](docs/assets/lausanne-overview.jpg)

## What it does

* **The real city, in voxels.** Lausanne and its 15 neighbouring
  municipalities (Renens, Ecublens and the EPFL, Pully, Epalinges…): the
  terrain, every building with its roof, the streets, the trees and the
  lake, built from swisstopo open data, the federal building register and
  OpenStreetMap into 10 540 streamed tiles of 1 to 8 m voxels. Roofs take
  their colour from the aerial photo, facades from the building's age and
  type.
* **Fine, sharp or retro pixels.** The city is drawn with fine, antialiased
  pixels; the account menu switches to *Sharp* (the screen's full
  resolution) or *Large*, the retro pixel-art look.
* **A living city.** By day the sun stands where it stands over Lausanne
  right now; the dark theme is a moonlit night with lit windows. Boats keep
  to a schedule on the lake (the shuttles to Évian, a paddle steamer to
  Vevey), gulls circle Ouchy, pigeons the cathedral, and clouds drift by.
* **Halal spots, by the community.** Spots are pixel-art badges showing
  their category. Add one from the map, vote, write a review that says how
  you checked (saw the certificate, asked the staff…), report problems. A
  spot with at least 5 downvotes and a score of −5 or lower is removed, and
  moderators can restore it for 14 days. Votes measure trust in a listing:
  only a certificate checked by a moderator is shown as verified.
* **Search** for spots and for addresses and places around Lausanne
  (swisstopo); a place outside the 3D city says so.
* **Moderation**: a console for reports and for removed and hidden spots,
  with a log of every action; moderators can hide reviews, check
  certificates and suspend members.
* **No passwords**: sign in with Google or GitHub, and with an e-mail link
  once an SMTP server is set up.
* **Accessible**: WCAG 2.2 AA target, a keyboard model for the 3D map with
  spoken feedback, a list alternative to the map, Reduce motion and
  forced-colour support; axe checks run in CI.
* **Private**: no ads or tracking, pseudonymous names, and your position is
  only used in your browser (unless you place a spot there).
* French and English, light and dark.
* **Free to run** on the free plans of Vercel, Cloudflare Pages and
  Supabase; GitHub Actions build the city and deploy the database.

![Three phone screens: the city with its badges, the list of spots in view, and a spot's panel over the map](docs/assets/phone-views.jpg)

## Quick start

With [Bun](https://bun.sh) 1.4.2 and Node.js 20.9 or later:

```bash
bun install
bun dev        # http://localhost:3000
```

`bun dev` shows the published city (all 16 towns, streamed from Cloudflare
Pages, so it needs an internet connection) in **demo mode**: without a
Supabase project, spots, votes and reviews stay in your browser, seeded with
the halal places tagged in OpenStreetMap, and signing in with any e-mail
address is instant (an address starting with `mod` can moderate). Offline,
put `NEXT_PUBLIC_CITY_BASE_URL=/city/flon` in `apps/web/.env.local` to use
the small demo city that ships with the code. More in
[docs/getting-started.md](docs/getting-started.md).

## Run your own

Everything runs on free plans: Supabase (database, sign-in), Cloudflare
Pages (the city's 349 MB of tiles), Vercel (the web app) and GitHub Actions
(building the city, applying database migrations, keeping the free database
awake). [docs/operations/deployment.md](docs/operations/deployment.md) goes
through it step by step, from empty accounts to a live site.

## How it works

* **The city** is built offline by `geovox`, a Python pipeline: it voxelises
  terrain, buildings, trees, bridges and land cover from the open data, and
  writes a quadtree of glTF tiles (meshopt and gzip) plus a low-detail
  backdrop of the lake and the mountains.
* **The web app** (Next.js 16, React Three Fiber, three.js) streams those
  tiles in web workers by screen-space error, under a Base UI and Tailwind
  interface translated with next-intl.
* **The backend** is Supabase: PostgreSQL with PostGIS and row-level
  security, where every write goes through SQL functions that enforce the
  rules (daily limits, removals, moderation), tested with pgTAP.

## Repository

| Path | Contents |
| --- | --- |
| [`apps/web`](apps/web) | the Next.js app: the 3D city, the interface, the data layer |
| [`packages/geo-types`](packages/geo-types) | LV95/WGS84 transforms, tile maths, manifest schema |
| [`pipelines/geodata`](pipelines/geodata) | `geovox`, the pipeline from open geodata to voxel tiles |
| [`supabase`](supabase) | database migrations (RLS, RPC API, moderation), seed, pgTAP tests |
| [`docs`](docs) | architecture, pipeline, decisions, design, operations |

## Documentation

Everything is in [`docs/`](docs/README.md): an [overview](docs/overview.md),
how the [streaming](docs/architecture/streaming-and-lod.md), the
[rendering](docs/architecture/rendering.md) and the
[pipeline](docs/pipeline/README.md) work, the
[data model](docs/backend/data-model.md), 27
[decision records](docs/decisions/README.md), the
[design system](docs/design/design-system.md) and
[accessibility](docs/design/accessibility.md) notes, the
[deployment](docs/operations/deployment.md) guide and a
[log of findings](docs/research/findings.md).

## Tests

```bash
bun run typecheck && bun run lint && bun run test     # types, lint, unit tests
bun run build && bun run test:e2e                     # Playwright + axe
cd pipelines/geodata && pytest                        # the pipeline
bash scripts/test-db.sh                               # pgTAP (PostgreSQL 16 + PostGIS + pgTAP)
```

All of them run in CI on every push.

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run the
checks above for the parts you changed; [docs/getting-started.md](docs/getting-started.md)
covers the local setup, including a local Supabase. To add halal places, use
the app, or tag them `diet:halal=yes` (or `only`) on OpenStreetMap: they
then join the starting list the next time it is generated.

## Data and licences

Code: [MIT](LICENSE). Geodata © [swisstopo](https://www.swisstopo.admin.ch)
(open government data); building register © [FSO](https://www.housing-stat.ch/)
(GWR); map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
(ODbL). Facts added by the community are published under the ODbL. Fonts:
Geist (SIL Open Font License); icons: Phosphor (MIT). See
[docs/legal/data-licensing.md](docs/legal/data-licensing.md).
