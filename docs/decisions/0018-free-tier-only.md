# 0018. Free tiers only; what that implies

Status: accepted · Date: 2026-10-21

## Context

The owner's rule: nothing chosen may need to be paid for, except a domain
name or something of that kind. The site must still be launchable for real
users, safely.

## Decision

| Need | Service (plan) | Relevant free limits at the time of writing | Notes |
| --- | --- | --- | --- |
| Web app | Vercel (Hobby) | personal, **non-commercial** use; 100 GB bandwidth/month | static pages, so function usage is tiny |
| 3D city | Cloudflare Pages (Free) | 20 000 files/site, 25 MiB/file, static requests not billed | 6.5k files, 190 MB ([0004](0004-tile-hosting.md)) |
| Database + auth | Supabase (Free) | 2 projects, 500 MB database, 50 000 monthly active users; **paused after 7 days without activity** | a spot is ~1 kB; years of headroom |
| Sign-in e-mail | Resend (3 000/month, 100/day) or Brevo (300/day) | free tiers | Supabase's built-in mailer is for testing only |
| Bot protection | Cloudflare Turnstile | free | optional |
| OAuth | Google, GitHub | free | optional |
| Search, addresses | swisstopo GeoAdmin API | free, no key, fair use | |
| Geodata | swisstopo OGD, OpenStreetMap | free (attribution; ODbL) | |
| CI, city builds | GitHub Actions | unlimited for public repositories; 2 000 min/month for private ones on the Free plan | a CI run bills about 15 runner minutes (the end-to-end job dominates) |
| Domain | any registrar | **the only optional cost** (~CHF 10–20/year for a `.ch`) | `*.vercel.app` and `*.pages.dev` work without one |

## Alternatives

* Paid tiers (Vercel Pro, Supabase Pro) remove the non-commercial clause and
  the inactivity pause; they can be adopted later without code changes.
* Self-hosting on a free VM (Oracle Cloud free tier, etc.): free in money but
  costly in maintenance and security patching for volunteers.

## Consequences

* **Non-commercial**: Vercel Hobby forbids commercial use. A community map
  with no ads or sales fits; sponsorships or paid listings would require
  Vercel Pro or another host (the app is a static Next.js build and can move,
  e.g. to Cloudflare).
* **Inactivity pause**: a Supabase free project with no requests for a week is
  paused and must be resumed from the dashboard. Any real traffic prevents
  it; the runbook explains how to resume
  ([runbook](../operations/runbook.md#the-database-is-paused)).
* **E-mail**: magic links need a free SMTP account and, for deliverability,
  a domain with SPF/DKIM records (the domain is the allowed cost); OAuth
  sign-in works without either.
* **Private repository**: CI minutes are limited and the "source code" and
  "GitHub issues" links on the site require the repository to be public
  ([deployment checklist](../operations/deployment.md#launch-checklist)).
