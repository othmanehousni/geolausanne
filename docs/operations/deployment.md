# Deployment

Production is three free services plus GitHub ([ADR 0018](../decisions/0018-free-tier-only.md)):

| Piece | Service | Deployed by |
| --- | --- | --- |
| Web app (Next.js) | Vercel, Hobby plan | Vercel's GitHub integration (every push to `main`; previews for other branches) |
| 3D city tiles | Cloudflare Pages, Free plan | `.github/workflows/city.yml` (manual) |
| Database, auth, cron | Supabase, Free plan | `.github/workflows/database.yml` (every push to `main` that changes a migration, after the pgTAP suite passes; or by hand) |
| Keeping the free database awake | GitHub Actions | `.github/workflows/keepalive.yml` (one tiny read a day) |
| Sign-in e-mails | Resend or Brevo, free tier | SMTP settings in Supabase |

Accounts and keys cannot be created from the repository; the steps below are
for the project owner. Everything works without them in demo mode.
Dashboard menu names move around over time; the setting names below are the
stable part.

## Go live: what to create, and where each value goes

Never paste a secret into an issue, a commit or a chat: each one goes
straight into the settings page that uses it. Public values (the Supabase
URL and publishable key, site keys) end up in the browser anyway.

| Service | Create | Value | Put it in | Kind |
| --- | --- | --- | --- | --- |
| **Supabase** | a project (Free, region Frankfurt) | database password | GitHub secret `SUPABASE_DB_PASSWORD` | secret |
| Supabase | a personal access token | token | GitHub secret `SUPABASE_ACCESS_TOKEN` | secret |
| Supabase | — | project ref (`xxxx` in `xxxx.supabase.co`) | GitHub variable `SUPABASE_PROJECT_REF` | public |
| Supabase | — | Project URL and publishable key | Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; GitHub variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (keep-alive) | public |
| **Vercel** | an account (Hobby) and a project importing the repository, root `apps/web` | — | — | — |
| **Cloudflare** | an API token with *Cloudflare Pages: Edit* | token, account id | GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret |
| Cloudflare | — (after the first city deployment) | `https://geolausanne-city.pages.dev` | Vercel `NEXT_PUBLIC_CITY_BASE_URL` | public |
| GitHub and/or Google (optional, recommended) | an OAuth app | client id and secret | Supabase → Authentication → Providers; then Vercel `NEXT_PUBLIC_AUTH_PROVIDERS` | secret (in Supabase only) |
| Resend or Brevo (needed for e-mail links to anyone outside the Supabase team) | an SMTP key and a verified sender | SMTP host, user, key | Supabase → Authentication → SMTP | secret (in Supabase only) |
| Cloudflare Turnstile (optional) | a widget | site key, secret key | Vercel `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; Supabase → Attack protection | site key public, secret in Supabase |
| You | an address for privacy requests | e-mail | Vercel `NEXT_PUBLIC_CONTACT_EMAIL` | public |

The shortest path to a working public site, in order: Supabase project →
GitHub secrets and variables → run **Database migrations** with *seed* →
GitHub/Google OAuth in Supabase (sign-in works without a domain or SMTP) →
Cloudflare token → run **City tiles** → import the repository on Vercel
with the environment variables → set Supabase's Site URL to the Vercel URL.
Steps in detail below.

## 1. Supabase

1. Create a project at supabase.com (Free plan). Region: **Central EU
   (Frankfurt)**, as stated in the privacy policy. Keep the database password.
2. Note the **project ref** (the `xxxx` in `https://xxxx.supabase.co`).
3. Create a personal **access token** (Account → Access tokens).
4. In GitHub: *Settings → Secrets and variables → Actions*:
   * secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`;
   * variable `SUPABASE_PROJECT_REF`.
5. Run the **Database migrations** workflow (*Actions → Database migrations →
   Run workflow*) with **seed** checked the first time (loads the 11
   OpenStreetMap places). From then on every push to `main` that changes
   `supabase/migrations` runs it on its own: the pgTAP suite first, on a
   fresh PostgreSQL, then `supabase db push` (only new migrations are
   applied; the log lists them first). Until the secrets exist, the workflow
   says so and deploys nothing.
   Local alternative: `supabase link --project-ref <ref>` then
   `supabase db push --include-seed`.
6. Check the purge job: *Integrations → Cron* should list
   `purge-removed-places` (daily 03:17 UTC). If `pg_cron` was not enabled,
   enable it under *Database → Extensions* and run the contents of
   `supabase/migrations/20261021000500_cron.sql` in the SQL editor.
7. *Authentication → URL configuration*: **Site URL** = your production URL
   (e.g. `https://geolausanne.ch` or `https://<project>.vercel.app`);
   **Redirect URLs**: `https://<your-domain>/**` (and
   `https://*-<team>.vercel.app/**` if previews should sign in). The callback
   is `/<locale>/auth/callback?next=…`, hence the `/**`.
8. *Authentication → Sign in / Providers*: e-mail on (confirm e-mail on).
   Configure SMTP before inviting anyone ([below](#e-mail-for-sign-in-links)).
9. *Project settings → API keys*: copy the **Project URL** and the
   **publishable key** for Vercel, and add both as GitHub **variables**
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: the keep-alive workflow
   reads the spots once a day, because Supabase pauses free projects after
   a week without activity.
10. Make yourself admin once you have signed in on the site
    ([moderation guide](moderation.md#making-someone-a-moderator)).

## E-mail for sign-in links

Supabase's built-in mailer **only delivers to members of the project's team
and is limited to 2 messages per hour**: fine for testing, unusable for a
public site. Use a free SMTP provider:

| Provider | Free tier (at the time of writing) | SMTP |
| --- | --- | --- |
| Resend | 3 000 e-mails/month, 100/day, 1 domain | `smtp.resend.com`, port 465, user `resend`, password = an API key |
| Brevo | 300 e-mails/day | `smtp-relay.brevo.com`, port 587, your SMTP login and key |

1. Verify a sending domain with the provider (SPF and DKIM DNS records; this
   is where a domain name helps deliverability).
2. Supabase: *Authentication → Emails → SMTP settings*: enable custom SMTP,
   sender `GeoLausanne <no-reply@your-domain>`, host, port, user, password.
3. Raise *Authentication → Rate limits → e-mails sent per hour* to a sensible
   value (e.g. 30).
4. Test with an address that is **not** a team member.

OAuth sign-in (below) works without any SMTP.

## 2. OAuth providers (optional)

* **GitHub**: *Settings → Developer settings → OAuth Apps → New*; callback
  URL `https://<project-ref>.supabase.co/auth/v1/callback`.
* **Google**: Google Cloud console → *APIs & Services → Credentials → OAuth
  client ID (Web)*; authorised redirect URI as above; consent screen in
  production mode.
* Enable each provider in Supabase with its client id and secret, then set
  `NEXT_PUBLIC_AUTH_PROVIDERS=github,google` (either or both) on Vercel.

## 3. City tiles on Cloudflare Pages

1. Cloudflare dashboard → *Workers & Pages → Create → Pages → Upload assets
   (direct upload)*: create a project named **`geolausanne-city`** (or another
   name, then set the GitHub variable `CF_PAGES_PROJECT`), production branch
   `main`. Upload anything to finish the wizard; the workflow replaces it.
2. *My profile → API tokens → Create token* with the permission
   **Account → Cloudflare Pages → Edit**. Note your **account id** (dashboard
   sidebar or URL).
3. GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Run the **City tiles** workflow: area `agglomeration` (the default:
   Lausanne and its 15 neighbours), deploy checked. It downloads ~1.8 GB of
   source data, builds 10 540 tiles + horizon (10 543 files, ~349 MB, well
   under the 20 000-file limit), compresses them, adds `_headers` and
   publishes. Budget 45–90 minutes. `lausanne` builds the municipality alone.
   **Deploy the web app first** when the tiles change format (format 2 since
   the colour model, [ADR 0025](../decisions/0025-colour-model-from-open-data.md)):
   the current app draws formats 1 and 2, an older app refuses format 2.
   The workflow was test-run on GitHub on 2026-10-21 with area `flon` and
   deploy unchecked (every step except the upload to Cloudflare): 5 minutes,
   184 files, 11.1 MB, identical to the committed demo. With deploy
   unchecked the result is kept as a workflow artifact for 3 days.
5. The city is then at `https://geolausanne-city.pages.dev` (optionally add
   a custom domain such as `city.your-domain` under the project's *Custom
   domains*). Check `…/manifest.json` loads in a browser.

### Cache headers

`pipelines/geodata/cdn/_headers` (copied into the build):

* every file: `Access-Control-Allow-Origin: *`, `X-Content-Type-Options:
  nosniff`, `Cross-Origin-Resource-Policy: cross-origin`;
* `/lod0/*` … `/lod3/*` and `/horizon.glb`: `Cache-Control: public,
  max-age=31536000, immutable` (URLs carry `?v=<manifest version>`);
* `/manifest.json`: `Cache-Control: public, max-age=60, must-revalidate` (the
  app also fetches it with `no-cache`).

Cloudflare Pages joins the values of **all** rules matching a path, so
`Cache-Control` must not be set on `/*`: the manifest would receive
`immutable` too. Pages purges its edge cache on every deployment.

## 4. Web app on Vercel

1. *Add New → Project* → import `othmanehousni/geolausanne`.
2. **Root directory: `apps/web`**. [`apps/web/vercel.json`](../../apps/web/vercel.json)
   sets the rest: Next.js, an install of the whole Bun workspace from the
   repository root with the Bun version pinned in `package.json` (1.4.2,
   through `npx bun@1.4.2`, whatever Bun the build image has), and an
   ignore step that skips a deployment when a push changes nothing under
   `apps/web`, `packages` or the lockfile (pipeline-only and docs-only
   commits).
3. Node.js version: 22.x or newer (*Settings → Build and deployment*).
4. Environment variables (Production):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (or `NEXT_PUBLIC_SUPABASE_ANON_KEY` with a legacy anon key) |
| `NEXT_PUBLIC_CITY_BASE_URL` | `https://geolausanne-city.pages.dev` (no trailing slash) |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` (optional on `*.vercel.app`) |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | `github,google` (optional) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (optional) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | contact address for privacy requests (recommended) |

   For **Preview** deployments, leave the Supabase variables unset: previews
   then run in demo mode on the Flon tiles and never touch production data.
5. Deploy. All variables are `NEXT_PUBLIC_*`, inlined at build time: changing
   one requires a redeploy. The CSP's `connect-src` is derived from the
   Supabase and city URLs automatically.

## 5. Turnstile (optional)

Cloudflare dashboard → *Turnstile → Add widget* for your domain(s) (managed
mode). Site key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Vercel; secret key →
Supabase *Authentication → Attack protection → CAPTCHA* (provider Cloudflare
Turnstile). Enable both together, or sign-in will fail.

## 6. Domain (optional, the only cost)

Add it to the Vercel project, then update: Supabase Site URL and redirect
URLs, `NEXT_PUBLIC_SITE_URL`, the Turnstile widget's domains, and the SMTP
sending domain. A subdomain for the tiles (`city.…`) is optional.

## Launch checklist

* [ ] Repository **public** (the site links to its source code and, without
      a contact e-mail, to GitHub issues), or `NEXT_PUBLIC_CONTACT_EMAIL` set
      and the links accepted as they are.
* [ ] Migrations applied, seed loaded once, cron job listed.
* [ ] SMTP configured and tested with an outside address; OAuth tested if enabled.
* [ ] Site URL and redirect URLs match the production domain.
* [ ] City deployed; `NEXT_PUBLIC_CITY_BASE_URL` points to it; no CSP errors
      in the browser console.
* [ ] First admin set; at least two moderators named.
* [ ] About, privacy and terms pages read through; contact works.
* [ ] Lighthouse and axe on the production URL; a screen-reader pass
      (VoiceOver on iOS, NVDA or VoiceOver on desktop).
* [ ] Someone watches the moderation console daily during the first weeks.

## Updating

| Change | What to do |
| --- | --- |
| App code | push to the default branch (Vercel deploys); CI must be green |
| Schema | new migration file → CI pgTAP → run *Database migrations* |
| City data (new OSM/swisstopo editions, pipeline changes) | run *City tiles*; no app redeploy needed |
| Rules (thresholds, limits) | `update private.settings …` in the SQL editor; update `apps/web/src/lib/data/rules.ts` for the texts |
