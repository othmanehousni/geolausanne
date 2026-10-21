# 0022. Checks on every push; city and database deployments by hand

Status: accepted · Date: 2026-10-21

## Context

Three things deploy differently: the web app (frequent, cheap), the database
schema (rare, risky, irreversible) and the 3D city (rare, heavy: tens of
minutes and gigabytes of downloads). GitHub Actions minutes are free for
public repositories and limited for private ones.

## Decision

* **`ci.yml` on every push and pull request** (with `cancel-in-progress` per
  branch):
  * *web*: install, `typecheck`, `lint`, unit tests, production build, then
    Playwright end-to-end tests on desktop and mobile profiles with axe scans,
    using the demo backend and the committed Flon tiles (software WebGL, one
    browser at a time so 2-core runners are not starved);
  * *pipeline*: `pytest` on Python 3.13;
  * *database*: PostgreSQL 16 + PostGIS + pgTAP from Ubuntu packages, all
    migrations applied to a fresh database, then the pgTAP suite.
* **`city.yml`, manual** (`workflow_dispatch`, area `lausanne` or `flon`):
  build, horizon, compress, add `_headers`, deploy to Cloudflare Pages with
  `wrangler` (or keep a 3-day artifact).
* **`database.yml`, manual**: `supabase link` + `supabase db push`
  (optionally `--include-seed` on first launch).
* **The web app deploys through Vercel's Git integration** (production on the
  default branch, previews on pull requests); no deploy secrets in GitHub.
* Dependabot: GitHub Actions monthly, Bun weekly (minor and patch grouped;
  majors ignored, they are planned upgrades), pip monthly.

## Alternatives

* Automatic database migrations on merge: a bad migration would hit
  production immediately; a human-triggered workflow is safer for a small
  team.
* Rebuilding the city on every push: hours of runner time for unchanged data.
* Supabase's Docker stack in CI for database tests: slower; plain PostgreSQL
  with a small `auth` shim tests the same SQL.

## Consequences

* Secrets live only where needed: Cloudflare token and account id for
  `city.yml`, Supabase access token and database password for `database.yml`
  ([deployment](../operations/deployment.md)).
* End-to-end tests are slower on CI because WebGL runs on the CPU
  (SwiftShader): about 8–9 minutes for the suite on two cores, run serially;
  long dialog flows get the slow-test budget.
