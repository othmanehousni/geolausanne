# 0001. Bun monorepo: Next.js app, shared geo types, Python pipeline, Supabase

Status: accepted · Date: 2026-10-20

## Context

The blueprint proposed a monorepo separating the web app, a shared types
package, the geodata pipeline and the database migrations, and used Bun for
the web side. The pipeline and the client must agree exactly on coordinate
conventions, tile addressing and the manifest schema; the database and the
client must agree on coordinate transforms.

## Decision

* One repository, **Bun 1.4 workspaces** (`apps/*`, `packages/*`), lockfile
  committed, versions pinned (`packageManager: bun@1.4.2`).
* `apps/web`: Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9
  strict, Tailwind v4.
* `packages/geo-types`: LV95/WGS84 transforms, tile maths and the manifest
  schema in TypeScript, consumed as source (`transpilePackages`), unit-tested
  against PostGIS outputs. Its Python twin is `geovox/grid.py` +
  `geovox/manifest.py`; comments in both point at each other.
* `pipelines/geodata`: a Python 3.11+ package (`geovox`) with its own virtual
  environment, `pyproject.toml` and a fully pinned `requirements.lock`. It
  is deliberately not a Bun workspace. The one JS tool it needs (the
  meshoptimizer encoder) is run with Bun from the repository root.
* `supabase/`: the Supabase CLI layout (config, migrations, seed, tests).
* Root scripts delegate to the app (`bun dev`, `bun run build`, `bun run test`,
  `bun run typecheck`, `bun run lint`, `bun run test:e2e`, `bun run city:compress`).

## Alternatives

* **pnpm + Turborepo**: more machinery for one deployable app and one small
  package; Bun also runs TypeScript scripts directly (the compressor).
* **Separate repositories** for pipeline and app: the manifest schema and the
  coordinate conventions would drift; a change would need coordinated
  releases.
* **Pipeline in TypeScript/Node**: the geospatial stack (GDAL, rasterio,
  shapely, pyproj, numpy/numba) is far more mature in Python, as the
  blueprint suggested.

## Consequences

* Next.js still runs on Node.js (≥ 20.9); Bun is the package manager and
  script runner.
* Shared conventions are duplicated across two languages on purpose and kept
  honest by tests on both sides (`packages/geo-types/test`, `pipelines/geodata/tests`).
* CI installs Bun and Python separately ([0022](0022-ci-and-deployment-workflows.md)).
