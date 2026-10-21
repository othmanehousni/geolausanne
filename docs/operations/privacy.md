# Privacy: what is processed, where and why

This is the reasoning behind the public privacy policy
([`apps/web/src/content/legal.tsx`](../../apps/web/src/content/legal.tsx),
shown at `/fr/privacy` and `/en/privacy`). Legal frame: the Swiss Federal Act
on Data Protection (FADP / nLPD) and, for visitors from the EU, the GDPR.
Decision record: [ADR 0016](../decisions/0016-privacy-by-default.md).

## Data inventory

| Data | Who | Where | Purpose | Kept |
| --- | --- | --- | --- | --- |
| E-mail address | members | Supabase Auth (`auth.users`), EU | sending sign-in links; never shown or returned to other users | while the account exists |
| OAuth identity (Google/GitHub id, e-mail) | members who choose it | Supabase Auth | sign-in | while the account exists |
| Display name (pseudonym by default) | members | `profiles` | shown next to spots and reviews | while the account exists |
| Spots added | members | `places` (`created_by`) | the map | until removed (+14 days) or deleted; anonymised if the account is deleted |
| Votes | members | `votes`, `private.vote_events` | community trust, rate limiting, abuse investigation; only totals are public | while the account exists |
| Reviews and halal confirmations | members | `reviews` | public reviews | while the account exists |
| Reports | members | `reports` | moderation; visible to moderators only | while the account exists (reporter set to null if deleted) |
| Moderation log | moderators | `moderation_events` | accountability | indefinitely (no personal content beyond pseudonymous actor ids) |
| Session token | members | browser local storage (supabase-js) | staying signed in | until sign-out or expiry |
| Appearance, demo data | everyone | browser local storage | preferences; demo mode | until cleared |
| Language | everyone | `NEXT_LOCALE` cookie (next-intl) | remembering the language | session/browser |
| Position ("Go to my location") | anyone who uses it | **browser only** | moving the camera | not stored; sent only if used as a new spot's location |
| Search text, picked coordinates | anyone | sent to swisstopo's GeoAdmin API | search and address suggestions | per swisstopo's terms |
| IP address, user agent | everyone | Vercel, Cloudflare, Supabase logs | security and operation | per provider (days to weeks) |

Not collected: analytics, advertising identifiers, fingerprints, contact
lists, precise location history, phone numbers, real names.

## Processors

| Provider | Role | Data |
| --- | --- | --- |
| Vercel Inc. | hosts the web app | IP addresses in request logs |
| Cloudflare Inc. | hosts the 3D city; Turnstile (optional) | IP addresses in logs; Turnstile signals on the sign-in form |
| Supabase Inc. (AWS eu-central-1) | database and authentication | account and contribution data |
| E-mail provider (Resend or Brevo) | sends sign-in links | e-mail addresses, message metadata |
| Google / GitHub (optional) | OAuth sign-in | identity shared at sign-in |
| swisstopo (Swiss federal office) | search and reverse geocoding | search text, coordinates |

Each offers standard contractual clauses / a data processing agreement for
transfers outside Switzerland and the EU; the operator accepts them when
creating the accounts.

## Design choices that protect people

* Pseudonymous names by default; e-mail addresses never leave Supabase Auth.
* `created_by`, `user_id` and `reporter_id` are never granted to API roles;
  RPCs return only display names, `is_mine` and the caller's own vote.
* Votes are private; only totals are public.
* Location is used locally; nothing tracks movement.
* No third-party scripts except optional Turnstile on the sign-in dialog;
  fonts are self-hosted.
* Strict security headers (CSP, `frame-ancestors 'none'`, `Referrer-Policy`,
  `Permissions-Policy` allowing only geolocation).
* No consent banner needed: only strictly necessary storage is used.

## Handling requests

Contact: `NEXT_PUBLIC_CONTACT_EMAIL` (shown on the privacy and terms pages),
otherwise the repository's GitHub issues. Answer within 30 days.

* **Access**: in the Supabase SQL editor, export the person's rows from
  `profiles`, `places` (`created_by`), `votes`, `reviews`, `reports`
  (`reporter_id`) using their user id (*Authentication → Users*, search by
  e-mail).
* **Rectification**: members can change their display name and edit their
  reviews themselves; moderators can edit spots.
* **Deletion**: delete the user in *Authentication → Users*. Cascades delete
  the profile, votes and reviews; reports keep their content with the
  reporter set to null; spots stay on the map with `created_by` set to null
  (they are part of the open ODbL database, as the terms explain).
* **Objection to a specific spot or review** (e.g. a business owner): treat it
  as a moderation report ([moderation guide](moderation.md)).

## When something changes

Update the policy text (both languages), bump `LEGAL_UPDATED` in
`legal.tsx`, and update this inventory in the same pull request. New
processors or new kinds of data need a line in both places.
