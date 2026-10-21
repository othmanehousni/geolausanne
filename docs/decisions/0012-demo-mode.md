# 0012. A browser-only demo backend with the same rules

Status: accepted · Date: 2026-10-21

## Context

Creating a Supabase project, keys and an SMTP account is the operator's job
and cannot be done from the repository. Yet developers, reviewers of a pull
request preview and the end-to-end tests all need the complete product:
adding spots, voting until a spot is removed, reviewing, reporting,
moderating.

## Decision

* One data contract, `Repository` (`apps/web/src/lib/data/repository.ts`),
  with two implementations chosen at startup:
  `SupabaseRepository` when `NEXT_PUBLIC_SUPABASE_URL` and a key are set,
  otherwise **`DemoRepository`**.
* The demo backend implements the **same rules** as the SQL functions:
  service area, duplicate detection within 40 m (name similarity), no voting
  on your own spot, the removal thresholds, one review per user and spot,
  reports, moderation actions with an audit log. Shared numbers come from
  `lib/data/rules.ts`.
* Data lives only in the visitor's `localStorage` (`geolausanne-demo-v1`),
  seeded with the 11 halal places from OpenStreetMap. Sign-in is instant with
  any e-mail; an address starting with `mod` gets the moderator role.
* The interface shows a "demo mode" notice in the attribution popover.

## Alternatives

* **A shared public demo database**: costs, abuse and moderation of a
  sandbox.
* **Mock data without rules**: the end-to-end tests would test the mocks, not
  the product's behaviour.
* **Supabase local stack in CI** (Docker): heavier and slower for every push;
  the database is tested separately with pgTAP instead.

## Consequences

* Every pull request preview on Vercel is fully usable with no secrets.
* The rules exist twice (SQL and TypeScript); `rules.ts` and
  `private.settings` must be changed together. Unit tests cover the demo
  backend (`demo-repository.test.ts`), pgTAP covers the SQL.
* Nothing typed in demo mode leaves the browser (stated in the privacy policy).
