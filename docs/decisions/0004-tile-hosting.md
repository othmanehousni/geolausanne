# 0004. Host the city on Cloudflare Pages; commit only the Flon demo

Status: accepted · Date: 2026-10-21

## Context

The whole municipality is 6 483 static files (6 482 tiles + horizon) and
190 MB, immutable per build, fetched cross-origin by workers. The blueprint
says: "publish generated assets to object storage behind a CDN, not to the
Next.js deployment itself". Nothing may cost money. Development, previews and
CI also need a city without any external account.

## Decision

* **Production tiles on Cloudflare Pages (free plan)**, project
  `geolausanne-city` by default, deployed by the manual `City tiles` workflow
  with `wrangler pages deploy` ([deployment](../operations/deployment.md#3-city-tiles-on-cloudflare-pages)).
  The free plan allows 20 000 files per site and 25 MiB per file; the build
  needs 6 484 files (with `_headers`) and its largest tile is 110 KB.
* A `_headers` file sets `Access-Control-Allow-Origin: *`, a one-year
  `immutable` cache for tiles and the horizon, and a 60-second cache for the
  manifest. Tile URLs carry `?v=<manifest version>`, so a new build never
  serves stale tiles and old tiles never need purging.
* **The Flon demo (181 tiles, 11 MB) is committed** in
  `apps/web/public/city/flon` and served by Next.js. It is the default
  `NEXT_PUBLIC_CITY_BASE_URL`, used by local development, Vercel previews and
  the end-to-end tests. Other builds in `public/city/*` are git-ignored.

## Alternatives

| Option | Why not |
| --- | --- |
| Commit the full city / serve it from Vercel | 190 MB of binaries churning in git history; Vercel Hobby deployments and bandwidth (100 GB/month) are meant for the app, not a data CDN |
| GitHub Pages | 1 GB site limit and ~100 GB/month soft bandwidth, but cache headers cannot be set (10-minute max-age) and the files would live in git |
| Cloudflare R2 (+ public bucket) | free tier is generous, but enabling R2 asks for a payment method |
| Supabase Storage | 1 GB storage and a few GB of egress on the free plan: one viral day would exhaust it |
| Netlify | static hosting works, but the free plan's bandwidth/credit allowance is lower and the deploy story is no simpler |
| jsDelivr / npm as a CDN | package size limits and not meant for app data |

## Consequences

* Two origins in production: the app (Vercel) and the city (`*.pages.dev`
  or a custom subdomain). CSP `connect-src` includes the city origin
  automatically from `NEXT_PUBLIC_CITY_BASE_URL`.
* Finding: Cloudflare Pages **joins** the values of every `_headers` rule
  that matches a path. A catch-all `Cache-Control` on `/*` would leak
  `immutable` into the manifest's header, so `Cache-Control` is set per path
  (`/lod0/*` … `/lod3/*`, `/horizon.glb`, `/manifest.json`).
* Updating the city = re-running the workflow; the app needs no redeploy
  because it reads the manifest at runtime (fetched with `no-cache`).
