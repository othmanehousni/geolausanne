# Data model and API

The backend is a Supabase project: PostgreSQL (17 on Supabase; the CI suite
runs on 16) with PostGIS, `pg_trgm` and `unaccent` in the `extensions`
schema, Supabase Auth, and `pg_cron` for maintenance. There is **no custom
server**: the browser calls PostgreSQL functions through PostgREST.

Migrations ([`supabase/migrations`](../../supabase/migrations)):

| File | Contents |
| --- | --- |
| `…000100_extensions.sql` | extensions, the internal `private` schema (never exposed by the API) |
| `…000200_schema.sql` | enums, tables, indexes, tunable settings |
| `…000300_functions.sql` | helpers, triggers, the RPC API (read, write, moderation, maintenance) |
| `…000400_security.sql` | row-level security, privileges, grants |
| `…000500_cron.sql` | daily purge job (skipped gracefully where `pg_cron` is missing) |

## Design rules

1. **Every table has row-level security**, and the API roles (`anon`,
   `authenticated`) have **no table privileges at all**. Clients read and
   write only through `SECURITY DEFINER` functions with a pinned empty
   `search_path`, which validate the caller, the input and the rate limits.
   RLS policies still describe what each role could read if a grant were ever
   added (defence in depth).
2. **Counts are computed by the server.** Vote totals, review counts, ratings,
   halal confirmations and the removal decision are maintained by triggers,
   never accepted from a client.
3. **Votes are not certification.** Votes measure community trust in a
   listing; `certification_verified` is a separate claim only moderators can
   set (the blueprint: "do not equate votes with certified halal status").
4. **Privacy by default.** No e-mail address or user id is ever returned to
   other users; public names are pseudonyms ([privacy](../operations/privacy.md)).

## Tables

```
auth.users ──1:1── profiles (display_name, role, banned_until)
     │
     ├──< places (created_by)  ──< votes (place_id, user_id)  → counters on places
     │        │                ──< reviews (one per user and place) → counters on places
     │        └──< reports (place or review) >── reporter
     └──< moderation_events (actor; null = automatic)
private.settings (tunable rules)    private.vote_events (append-only vote log)
```

**`profiles`**: one per auth user, created by the `on_auth_user_created`
trigger. `display_name` (1–40 chars) is the metadata name if the user gave
one, else `member-` + 6 hex characters of the user id; it is never derived
from the e-mail address or an OAuth profile. `role` (`user` | `moderator` |
`admin`) and `banned_until` can only be changed by moderators/admins (trigger
`profiles_guard`, see below).

**`places`**: a halal food spot.

| Column | Type | Notes |
| --- | --- | --- |
| `name` | text, 2–80 chars after trimming | whitespace collapsed by the RPC |
| `category` | enum `restaurant, fast_food, cafe, bakery, butcher, grocery, food_truck, other` | |
| `cuisine` | text[] ≤ 6 | lower-cased, deduplicated |
| `location` | `geometry(Point, 4326)` + GiST index | WGS84, as in the blueprint |
| `elevation` | real, 300–1 200 | LN02 metres of the picked point (pins on roofs) |
| `address`, `website` (http/https only), `phone`, `opening_hours` (OSM syntax), `description` | text with length limits | |
| `halal_level` | enum `full, partial, unknown` | everything halal / some halal options / not stated |
| `certification` | enum `certified, self_declared, community` | the *claim* |
| `certifier` | text ≤ 80 | name of the certifying body |
| `certification_verified` | boolean | set by moderators only; votes never change it |
| `serves_alcohol` | boolean, nullable | |
| `upvotes`, `downvotes`, `score` (generated: up − down) | integers | maintained by triggers |
| `confirmations`, `last_confirmed_at` | | halal confirmations from visible reviews |
| `review_count`, `rating_sum`, `rating_count` | | average = sum / count |
| `status` | enum `active, hidden, removed` | |
| `removed_at`, `removal_reason` | | `community_downvotes` or `moderator` |
| `moderation_lock` | boolean | set when a moderator restores a place: votes can no longer auto-remove it |
| `source`, `osm_id` | `community` \| `osm` \| `import`; unique OSM id | seed rows come from OpenStreetMap |
| `created_by` | user id, `on delete set null` | a deleted account leaves its spots anonymous |

**`votes`**: primary key `(place_id, user_id)`, `value ∈ {−1, 1}`; clearing a
vote deletes the row. Every change is also appended to
`private.vote_events` (rate limiting, abuse investigation).

**`reviews`**: unique per `(place_id, user_id)`; optional `rating` 1–5,
`body` ≤ 1 000 chars, `halal_confirmed` with a required
`confirmation_method` (`certificate`, `asked_staff`, `owner`, `other`); a
review must contain at least a rating, text or a confirmation. `status`
`visible` | `hidden`.

**`reports`**: about a place *or* a review; `reason` (`not_halal`,
`closed`, `wrong_location`, `duplicate`, `spam`, `offensive`, `other`),
`details` ≤ 500; `status` `open` → `resolved` | `dismissed` with the
moderator and a note. A user has at most one open report per target (a new
report updates it).

**`moderation_events`**: audit trail of every moderation action and every
automatic removal or purge (`actor_id` null = the system).

## Community removal

Implemented in `private.apply_auto_removal`, run by the vote trigger after
every vote change:

```
status = 'active'  AND  NOT moderation_lock
AND downvotes >= removal_min_downvotes (5)
AND score     <= removal_max_score     (-5)
  → status = 'removed', removed_at = now(), removal_reason = 'community_downvotes'
  → moderation_events: auto_remove, "score -5 with 5 downvotes"
```

* A removed place disappears from the map and the search for everyone except
  its author and moderators.
* Moderators see it in the console's "Removed" tab and can **restore** it,
  which sets `moderation_lock` so the same voters cannot remove it again.
* `private.purge_removed_places()` deletes places removed more than
  `removal_grace_days` (14) ago; `pg_cron` runs it daily at 03:17 UTC
  (`purge-removed-places`). Votes, reviews and reports cascade.

Why two thresholds instead of "too many downvotes": see
[ADR 0009](../decisions/0009-community-removal-rule.md).

## Tunable settings (`private.settings`)

Changed with SQL, no migration or deployment needed:

| Key | Default | Meaning |
| --- | --- | --- |
| `removal_min_downvotes` | 5 | minimum downvotes for removal |
| `removal_max_score` | −5 | score at or below which removal happens |
| `removal_grace_days` | 14 | days before a removed place is deleted for good |
| `vote_min_account_age_minutes` | 10 | new accounts wait before voting |
| `limit_places_per_day` | 5 | new places per user per 24 h |
| `limit_reviews_per_day` | 20 | reviews written or edited per 24 h |
| `limit_reports_per_day` | 20 | reports per 24 h |
| `limit_votes_per_hour` | 120 | vote changes per hour |
| `duplicate_radius_m` | 40 | radius of the duplicate check |
| `service_area` | `[6.45, 46.44, 6.85, 46.65]` | accepted WGS84 box for new places (Lausanne and neighbours) |

The web app keeps a copy of the first four and the last two in
[`apps/web/src/lib/data/rules.ts`](../../apps/web/src/lib/data/rules.ts)
(texts and the demo backend); keep both in sync.

## RPC API

All functions return typed rows; place-returning functions share the
`place_result` type, which adds LV95 `easting`/`northing` (computed with
`ST_Transform(…, 2056)`), `avg_rating`, `creator_name`, `is_mine` and
`my_vote` for the caller.

**Read (anonymous and signed in)**

| Function | Purpose |
| --- | --- |
| `places_in_bbox(west, south, east, north, max_results = 400)` | active places in a WGS84 box, best score first (≤ 1 000) |
| `place_detail(place_id)` | one place, if the caller may see it (active, or own, or moderator) |
| `search_places(query, max_results = 10)` | accent- and case-insensitive trigram search on name, plus substring match on name, cuisine and address (≤ 50) |
| `nearby_places(lon, lat, radius_m = 60)` | active places within a radius (≤ 500 m), nearest first; used for duplicate hints |
| `list_reviews(place_id, max_results = 50)` | visible reviews (plus the caller's own and, for moderators, hidden ones), caller's first |

**Write (signed in, not suspended)**

| Function | Checks |
| --- | --- |
| `create_place(p_name, p_lon, p_lat, …)` | rate limit; name ≥ 2 chars; inside the service area; **duplicate**: an active or hidden place within 40 m whose normalised name has trigram similarity > 0.45 → `duplicate_place` with the existing id |
| `update_place(p_id, …)` | moderators, or the author within 7 days while active; changing the certification claim or certifier clears `certification_verified` |
| `cast_vote(p_place_id, p_value)` | value 1 / −1 / 0 (clear); place active; **not your own place**; account older than 10 min; hourly limit; returns the updated place (status `removed` when the vote removed it) |
| `upsert_review(p_place_id, p_rating, p_body, p_halal_confirmed, p_confirmation_method)` | place active; daily limit; a confirmation needs a method |
| `delete_my_review(p_place_id)` | |
| `submit_report(p_reason, p_place_id \| p_review_id, p_details)` | exactly one target; daily limit; one open report per user and target |
| `my_profile()`, `update_my_profile(p_display_name)` | |

**Moderation (moderators and admins; each checks the role itself)**

| Function | Action (logged in `moderation_events`) |
| --- | --- |
| `mod_list_reports(status, max)` | reports with target names and the number of open reports per target |
| `mod_resolve_report(id, resolved \| dismissed, note)` | close a report |
| `mod_list_places(status, max)` | places by status (`removed`, `hidden`, …) |
| `mod_set_place_status(id, status, note)` | hide, remove or restore (restore sets `moderation_lock`) |
| `mod_verify_certification(id, verified, note)` | mark the certification as checked (sets `certification = certified`) or unverify |
| `mod_delete_place(id, note)` | delete now |
| `mod_set_review_status(id, visible \| hidden, note)` | hide or show a review |
| `mod_list_events(max)` | the audit log |
| `mod_ban_user(user_id, until, note)` | suspend (or lift with `null`); moderators can only suspend plain users |
| `admin_set_role(user_id, role)` | admins only |

## Errors

Functions raise a stable message (and SQLSTATE) that the client translates
([`apps/web/src/lib/errors.ts`](../../apps/web/src/lib/errors.ts)):

| Message | SQLSTATE | When |
| --- | --- | --- |
| `not_authenticated` | 28000 | write without a session |
| `account_suspended` | 42501 | banned (detail: until when) |
| `forbidden` | 42501 | not allowed (role, not the author, …) |
| `own_place` | 42501 | voting on your own place |
| `account_too_new` | 42501 | voting in the first 10 minutes |
| `rate_limited` | 54000 | a daily/hourly limit (detail: which setting) |
| `invalid_name`, `invalid_vote`, `invalid_target`, `invalid_status`, `outside_service_area`, `confirmation_method_required` | 22023 | bad input |
| `duplicate_place` | 23505 | a similar place exists nearby (detail: its id) |
| `not_found` | P0002 | unknown or inactive target |

## Security model

* Exposed schema: `public` only. Helpers, settings and the vote log live in
  `private`.
* `revoke all` on every table and sequence for `anon`/`authenticated`; the
  only table grant is `select (id, display_name, role, created_at)` on
  `profiles`.
* `revoke execute` on all functions, then explicit grants for the API above;
  `alter default privileges` makes **future functions private until granted**.
* Every function is `SECURITY DEFINER` with `set search_path = ''` and
  schema-qualified names (no search-path hijacking).
* `profiles_guard` (a `SECURITY INVOKER` trigger) rejects role or ban changes
  unless the current role is `postgres`, `supabase_admin` or `service_role`,
  or the caller is a moderator.
* Rate limits are counted from the tables themselves (places, reviews,
  reports) or from `private.vote_events`, so they cannot be bypassed by
  deleting and re-creating.
* Supabase Auth adds its own limits (sign-in requests per IP, e-mails per
  hour) and optional Cloudflare Turnstile ([auth](auth.md)).

## Seed data

[`supabase/seed.sql`](../../supabase/seed.sql) holds the 11 places tagged
`diet:halal=yes|only` in OpenStreetMap around Lausanne (extract of
2026-10-19), generated by `python -m geovox seed-places`. `only` maps to
`halal_level = full`, `yes` to `partial`; all are `certification =
community`, `source = osm`. They are ODbL data
([licensing](../legal/data-licensing.md)). The same rows feed the demo mode
(`apps/web/src/lib/data/demo-seed.json`).

## Tests

[`supabase/tests`](../../supabase/tests) (pgTAP, 59 assertions) run against a
plain PostgreSQL + PostGIS server through
[`scripts/test-db.sh`](../../scripts/test-db.sh), with a small shim that
provides Supabase's `auth` schema and roles
([`supabase/test-shim`](../../supabase/test-shim/supabase-auth-shim.sql)):

* `01_places_votes_test.sql` (35): profile creation and pseudonyms, tables not
  directly readable, anonymous map queries, input normalisation, service area,
  duplicates, rate limits, fuzzy search, vote idempotence/switch/clear, no
  direct vote inserts, no voting on your own place, new-account delay,
  auto-removal at the thresholds (four downvotes are not enough, the fifth
  removes), moderator restore and lock, purge, audit log;
* `02_reviews_moderation_test.sql` (24): reviews and halal confirmations,
  counters and averages, one editable review per user and place, listing
  order, reports (deduplicated), moderator-only access, hidden reviews,
  certification verification, suspensions, roles.
