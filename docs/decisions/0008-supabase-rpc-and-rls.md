# 0008. Supabase, writes and reads only through RPCs, RLS everywhere

Status: accepted · Date: 2026-10-21

## Context

The blueprint chose Supabase + PostGIS for places, votes and reviews, and
insisted that vote counts and verification status be computed server-side,
that each user has one active confirmation per place, that RLS is enabled,
and that a moderation workflow exists. The project has no budget for a
custom API server.

## Decision

* **Supabase (free plan)**: PostgreSQL with PostGIS, `pg_trgm`, `unaccent`,
  Supabase Auth, `pg_cron`. EU region recommended (Frankfurt) for data
  protection.
* **No table privileges for API roles.** Every read and write is a
  `SECURITY DEFINER` PostgreSQL function with `search_path = ''`, called
  through PostgREST (`supabase.rpc`). Functions validate the caller, clean
  and bound every input, enforce rate limits and duplicate checks, and return
  exactly the fields the UI needs (never e-mails or user ids of others).
* **RLS on every table** anyway, with policies describing what each role may
  read, so an accidental grant does not expose more than intended.
* **Triggers** keep counters (votes, reviews, ratings, confirmations) and
  apply the community removal rule in the same transaction as the vote.
* **Tunable rules** live in a `private.settings` table, not in code.
* **Tests** (pgTAP) run on plain PostgreSQL + PostGIS in CI with a small shim
  for Supabase's `auth` schema, so no Supabase account or Docker is needed.

Details: [data model](../backend/data-model.md).

## Alternatives

* **Direct table access with RLS policies only** (the common Supabase
  pattern): invariants such as "rate limit", "no duplicate within 40 m",
  "cannot vote on your own place" or "removal at thresholds" would need
  triggers anyway, and column-level exposure (e.g. `created_by`) is easy to
  get wrong. RPCs make the API explicit and reviewable.
* **A custom API (Next.js route handlers or a separate server)**: more code,
  a server bill or serverless limits, and the database would still need to
  enforce the rules for safety.
* **Firebase / Firestore**: no PostGIS or SQL; geo queries and moderation
  reports are awkward; vendor lock-in.

## Consequences

* The browser talks straight to Supabase; pages stay static.
* Changing a function signature needs a migration and a matching change in
  `supabase-repository.ts`, and the demo backend mirrors the same rules
  ([0012](0012-demo-mode.md)).
* Future functions are private by default (`alter default privileges`), so
  forgetting a grant fails closed.
