# Getting started

## Requirements

| Tool | Version | For |
| --- | --- | --- |
| [Bun](https://bun.sh) | 1.4.2 (pinned in `package.json`) | installing, scripts, the tile compressor |
| Node.js | ≥ 20.9 (22 used in development) | Next.js runs on Node |
| Python | ≥ 3.11 (3.13 in CI) | the geodata pipeline (optional) |
| GDAL (`ogr2ogr`), osmium-tool | GDAL 3.8+, osmium 1.16+ | the pipeline (optional) |
| PostgreSQL 16 + PostGIS 3 + pgTAP | | database tests (optional) |
| Supabase CLI + Docker | | a local Supabase stack (optional) |

## Run the app (demo mode)

```bash
bun install
bun dev            # http://localhost:3000 → redirects to /fr
```

Without any configuration the app runs in **demo mode**:

* `bun dev` shows the **published city**, Lausanne and its 15 neighbouring
  municipalities, straight from Cloudflare Pages: the committed
  `apps/web/.env.development` sets `NEXT_PUBLIC_CITY_BASE_URL`, so no `.env`
  file is needed (an internet connection is). Production builds (`bun run
  build`, the end-to-end tests) keep the committed Lausanne-Flon demo
  (`apps/web/public/city/flon`): central Lausanne only, about 3 × 3 km,
  with a "Demo city" chip in the bottom bar, where searching for Renens or
  EPFL says they are outside the 3D city. Offline, or to try the demo with
  `bun dev`: `NEXT_PUBLIC_CITY_BASE_URL=/city/flon` in `apps/web/.env.local`
  ([the whole city locally](#the-whole-city-locally));
* data lives in your browser (`localStorage` key `geolausanne-demo-v1`),
  seeded with the 11 halal places tagged in OpenStreetMap;
* "sign in" with any e-mail address is instant; an address starting with
  `mod` (e.g. `mod@example.org`) gets the moderator role;
* clear the site's data to start over.

## Environment variables

Copy `apps/web/.env.example` to `apps/web/.env.local`. All variables are
public (`NEXT_PUBLIC_*`, inlined at build time) and optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | – | Supabase project URL; with a key, switches off demo mode |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | – | publishable (browser) key; `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted for legacy keys |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | e-mail only | sign-in methods, comma separated: `email`, `google`, `github`; e-mail links need an SMTP server in Supabase, so a site without one lists only its OAuth providers (`google,github`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | – | Cloudflare Turnstile on the sign-in form |
| `NEXT_PUBLIC_CITY_BASE_URL` | the published city with `bun dev` (`.env.development`), `/city/flon` in production builds | where tiles are served from: `/city/agglomeration` for a local full build, the CDN URL in production |
| `NEXT_PUBLIC_SITE_URL` | Vercel URL or `http://localhost:3000` | canonical URLs, sitemap, Open Graph |
| `NEXT_PUBLIC_CONTACT_EMAIL` | – | contact on the privacy and terms pages (else GitHub issues) |

## Scripts (repository root)

| Command | Does |
| --- | --- |
| `bun dev` | Next.js dev server (Turbopack) |
| `bun run build` / `bun run start` | production build / serve it |
| `bun run typecheck` | geo-types `tsc`, then `next typegen && tsc --noEmit` |
| `bun run lint` | ESLint (Next, React Compiler rules, jsx-a11y) |
| `bun run test` | Vitest: geo-types and web |
| `bun run test:e2e` | Playwright + axe against `next start` (build first) |
| `bun run city:compress <dir>` | meshopt + gzip a built city, update the manifest |

## The whole city locally

Three ways to see Lausanne and its 15 neighbouring municipalities on your
computer, from the quickest:

1. **The published tiles**, the default of `bun dev` since the *City
   tiles* workflow first deployed to Cloudflare Pages
   ([deployment](operations/deployment.md#go-live-step-by-step)):
   `apps/web/.env.development` points at `https://geolausanne-city.pages.dev`.
   For a production build (`bun run build && bun run start`), set the same
   value in `apps/web/.env.local`. The tiles allow any origin, `localhost`
   included.
2. **The workflow's artifact.** Run *City tiles* with deploy unchecked,
   download the `city-agglomeration` artifact from the run (kept 3 days),
   unzip it into `apps/web/public/city/agglomeration` and set
   `NEXT_PUBLIC_CITY_BASE_URL=/city/agglomeration`.
3. **Build it yourself** (`--area lausanne` builds the municipality alone):

```bash
cd pipelines/geodata
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.lock -e .
python -m geovox build --area agglomeration --out ../../apps/web/public/city/agglomeration   # first time: ~1.8 GB download, ~25 min
python -m geovox horizon --out ../../apps/web/public/city/agglomeration
cd ../.. && bun run city:compress apps/web/public/city/agglomeration
echo "NEXT_PUBLIC_CITY_BASE_URL=/city/agglomeration" >> apps/web/.env.local
```

Everything under `public/city/` except the Flon demo is git-ignored. See
[pipeline](pipeline/README.md).

## A local Supabase

```bash
supabase start                 # Docker; prints the API URL and keys
supabase db reset              # applies migrations + seed.sql
# apps/web/.env.local:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from `supabase status`>
```

Magic-link e-mails are caught by the local mail viewer (Inbucket/Mailpit,
URL printed by `supabase start`). To test only the SQL, without Docker:
`bash scripts/test-db.sh` against a PostgreSQL 16 server with PostGIS and
pgTAP ([testing](operations/testing.md)).

## Repository map

```
apps/web            the Next.js app (see architecture/frontend.md)
packages/geo-types  coordinate transforms, tile maths, manifest schema
pipelines/geodata   geovox (Python) + meshopt compressor + CDN headers
supabase            migrations, seed, pgTAP tests, local config
scripts             test-db.sh
docs                this documentation
.github             CI, city and database workflows, Dependabot, security policy
```

## Conventions

* Commits: conventional style (`feat(web): …`, `fix(pipeline): …`).
* Decisions: add an ADR in `docs/decisions` for anything others would ask
  "why?" about.
* Keep mirrored definitions in sync: `geovox/grid.py` ↔ `geo-types/grid.ts`,
  `geovox/manifest.py` ↔ `geo-types/manifest.ts`, shader classes in
  `geovox/materials.py` ↔ `lib/world/materials.ts`, `private.settings` ↔
  `lib/data/rules.ts`, `fr.json` ↔ `en.json` (tested).
