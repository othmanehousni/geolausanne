# 0016. Privacy by default: no tracking, pseudonyms, local location

Status: accepted · Date: 2026-10-21

## Context

The site is run by volunteers in Switzerland and will be used from the EU. It
handles accounts, contributions and possibly visitors' locations. The Swiss
Federal Act on Data Protection (FADP/nLPD) and, for EU visitors, the GDPR
apply. Collecting less is the cheapest compliance and the strongest
protection.

## Decision

* **No analytics, advertising or tracking scripts**; no third-party fonts at
  runtime (fonts are self-hosted by `next/font`).
* **Pseudonymous public names**: a new account is `member-xxxxxx` unless the
  person chooses a name; the name is never derived from the e-mail address or
  an OAuth profile. E-mail addresses are never shown or returned to other
  users.
* **Location stays in the browser**: "Go to my location" only moves the
  camera; the position is sent only if the person uses it as the location of
  a new spot.
* **Minimal storage**: appearance and (in demo mode) test data in
  `localStorage`; one technical cookie for the language. No consent banner is
  needed because nothing non-essential is stored.
* **Votes are private**: only totals are public; each user only sees their
  own vote. Reports are visible to moderators only.
* **Retention**: removed spots are deleted after 14 days; account data lives
  as long as the account; deleting an account deletes votes, reviews and
  reports and anonymises the spots it created.
* **Hosting**: database in the EU (Supabase Frankfurt recommended); the
  privacy policy names every processor (Vercel, Cloudflare, Supabase,
  swisstopo for search, optional Google/GitHub/Turnstile).

Details: [operations/privacy.md](../operations/privacy.md); the public policy
is `apps/web/src/content/legal.tsx`.

## Alternatives

* Privacy-friendly analytics (self-hosted Plausible/Umami): would need
  hosting and a notice; not needed to run a community map.
* Showing contributors' real names: discourages contributions on a sensitive
  topic (religious dietary practice) and invites harassment.

## Consequences

* No usage metrics; health is judged by contributions and reports.
* The contact link on the legal pages points to `NEXT_PUBLIC_CONTACT_EMAIL`,
  or to the repository's GitHub issues if none is set (which requires the
  repository to be public).
