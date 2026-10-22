# 0024. Migrations deploy on main after their tests; a pinned Vercel install; a keep-alive

Status: accepted · Date: 2026-10-21 · Supersedes the database part of
[0022](0022-ci-and-deployment-workflows.md)

## Context

The owner asked for "a real backend, put on Vercel", and for the list of
credentials it needs. The backend already existed (Supabase: PostgreSQL with
row-level security, every read and write through RPCs, pgTAP-tested; the web
app's `SupabaseRepository`), but going live still meant several manual steps,
and three things could break a real deployment:

* database migrations were applied only by hand, so a merged migration could
  sit unapplied while the deployed app already expected it;
* Vercel's build image ships its own Bun, possibly older than the one that
  wrote `bun.lock` (lockfile version 2, Bun 1.4.2), and `--frozen-lockfile`
  then fails;
* Supabase pauses Free projects after about a week without activity, which
  would take a quiet site offline.

## Decision

* **Database migrations deploy themselves**: `database.yml` runs on every
  push to `main` that changes `supabase/migrations` (or the tests or the
  workflow). It first applies every migration to a fresh PostgreSQL 16 with
  PostGIS and runs the pgTAP suite, then lists the pending migrations and
  `supabase db push`es them. One run at a time, never cancelled half-way.
  Manual runs stay available (and are the only way to load the seed). The
  workflow skips the push with a notice while the Supabase secrets are not
  set, so the repository stays green before go-live.
* **`apps/web/vercel.json`** pins the install: from the repository root, with
  `npx bun@1.4.2 install --frozen-lockfile`, the same Bun as CI and local
  development. (An ignore command that skipped commits changing nothing the
  app is built from was removed before launch: see the update below.)
* **Keep-alive**: a scheduled workflow makes one public read a day
  (`places_in_bbox` over 100 m, one row) with the publishable key, from
  repository variables. Skipped until they are set.
* **Credentials** are listed in one table in the
  [deployment guide](../operations/deployment.md#go-live-what-to-create-and-where-each-value-goes),
  with where each one goes. Secrets go straight into GitHub, Vercel or
  Supabase settings; none is needed in the repository or shared in chat.

## Alternatives

* **Deploy the web app from GitHub Actions with the Vercel CLI**
  (`vercel build && vercel deploy --prebuilt`): full control over the build
  environment, but one more secret (`VERCEL_TOKEN`) with broad account
  access, and it loses Vercel's per-branch previews and checks for free. The
  Git integration plus a pinned install command gives the same
  reproducibility.
* **Apply migrations from the Vercel build**: couples a database change to
  every web deployment, including previews, and needs the database password
  in Vercel. Rejected.
* **A paid Supabase plan** (no pausing): excluded by the free-tier rule
  ([0018](0018-free-tier-only.md)).
* **GitHub environments with required reviewers** for the database push:
  not available for private repositories on the free GitHub plan; the
  owner can add one later.

## Consequences

* Merging a migration to `main` is a deployment: migrations stay
  forward-only and must be safe to apply while the previous app version is
  still live (add first, remove in a later release).
* A failing pgTAP test blocks the deployment instead of reaching production.
* The site needs no manual step after a merge except for the city tiles
  (heavy, rare, still by hand).

## Update (2026-10-22): no ignore command

The ignore command (`git diff --quiet HEAD^ HEAD -- <app paths>`) was
removed before the first deployment. It compared only the last commit of a
push, so the project's first deployment (main ended on a docs commit) could
be cancelled, and an app change pushed together with a later docs commit
never deployed. Vercel also runs it on dashboard redeploys unless a checkbox
is cleared, and a redeploy is how a changed `NEXT_PUBLIC_*` variable takes
effect. Every push to `main` now deploys; a build takes a few minutes of the
free quota ([finding 130](../research/findings.md#going-live)).
