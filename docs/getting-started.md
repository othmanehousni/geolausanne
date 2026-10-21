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

* the 3D city is the committed Lausanne-Flon demo (`apps/web/public/city/flon`);
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
| `NEXT_PUBLIC_AUTH_PROVIDERS` | – | `google`, `github` or both, comma separated |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | – | Cloudflare Turnstile on the sign-in form |
| `NEXT_PUBLIC_CITY_BASE_URL` | `/city/flon` | where tiles are served from: `/city/lausanne` for a local full build, the CDN URL in production |
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

## The whole municipality locally

```bash
cd pipelines/geodata
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.lock -e .
python -m geovox build --area lausanne --out ../../apps/web/public/city/lausanne   # ~3 GB download the first time
python -m geovox horizon --out ../../apps/web/public/city/lausanne
cd ../.. && bun run city:compress apps/web/public/city/lausanne
echo "NEXT_PUBLIC_CITY_BASE_URL=/city/lausanne" >> apps/web/.env.local
```

`public/city/lausanne` is git-ignored. See [pipeline](pipeline/README.md).

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
