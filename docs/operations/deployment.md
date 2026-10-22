# Deployment

Production is three free services plus GitHub ([ADR 0018](../decisions/0018-free-tier-only.md)):

| Piece | Service | Deployed by |
| --- | --- | --- |
| Web app (Next.js) | Vercel, Hobby plan | Vercel's GitHub integration (every push to `main`; previews for other branches) |
| 3D city tiles | Cloudflare Pages, Free plan | `.github/workflows/city.yml` (manual) |
| Database, auth, cron | Supabase, Free plan | `.github/workflows/database.yml` (every push to `main` that changes a migration, after the pgTAP suite passes; or by hand) |
| Keeping the free database awake | GitHub Actions | `.github/workflows/keepalive.yml` (one tiny read a day) |
| Sign-in | Google and GitHub through Supabase Auth; e-mail links once a free SMTP provider is set up | Supabase settings |

Accounts and keys cannot be created from the repository; the steps below are
for the project owner. Everything works without them in demo mode.
Dashboard menu names move around over time; the setting names below are the
stable part. Never paste a secret into an issue, a commit or a chat: each one
goes straight into the settings page that uses it. Public values (the
Supabase URL and publishable key, site keys) end up in the browser anyway.

## Go live, step by step

About an hour of clicking, plus one to two hours of unattended city build.
The order avoids rework: the city build starts first because it takes the
longest, and every value the web app is built with exists before Vercel
builds it, so the first deployment is the real one.

### 1. GitHub (2 minutes)

1. *Settings → General → Default branch*: switch to **`main`**. Do it before
   importing the repository into Vercel, which takes the default branch as
   its production branch.
2. *Branches*: delete `claude/brave-darwin-5h63h8` and
   `dependabot/bun/minor-and-patch-54c26d8e69` (Dependabot opens new pull
   requests against `main`).
3. Choose the visibility. **Public is recommended**: the site describes
   itself as open source and links to its code and issues, and public
   repositories get unlimited Actions minutes on 4-CPU runners (the city
   builds about twice as fast). Nothing secret is in the repository, and
   commits carry a no-reply address. If it stays private, set
   `NEXT_PUBLIC_CONTACT_EMAIL` (step 5) so visitors can reach you; private
   repositories have 2 000 free Actions minutes a month, and a city build
   uses one to two hours of them.

### 2. Cloudflare, then start the city build (5 minutes, then 1–2 hours unattended)

1. Create a free account at `dash.cloudflare.com`.
2. **Account id**: *Workers & Pages → Account Details → Account ID* (copy
   button), or search "Copy account ID" (Ctrl/⌘ K) on *Account home*.
3. *My Profile → API Tokens → Create Token → Create Custom Token*:
   permission **Account · Cloudflare Pages · Edit**, account resources: your
   account; *Continue to summary → Create Token*. Copy the token: it is
   shown once.
4. GitHub, *Settings → Secrets and variables → Actions → New repository
   secret*: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. GitHub, *Actions → City tiles → Run workflow*: branch `main`, area
   `agglomeration`, deploy checked. Its first step checks the token and
   creates the Pages project **`geolausanne-city`** (for another name, set
   the repository variable `CF_PAGES_PROJECT` first). Within a minute that
   step's log prints the city's address (the run's summary repeats it),
   normally `https://geolausanne-city.pages.dev`; Cloudflare adds a suffix
   when the name is taken in another account. Keep it for step 5. The run
   then builds and publishes the tiles while you do the rest
   ([details](#city-tiles-on-cloudflare-pages)).

### 3. Supabase (10 minutes)

1. `supabase.com` → *New project* (Free plan): any name, a generated
   database password (keep it), region **Central EU (Frankfurt)**, as the
   privacy policy says. Leave the Data API enabled (the default): the app
   reaches the database through it.
2. Collect four values:
   * the **project ref**, the `xxxx` in `https://xxxx.supabase.co`
     (*Project Settings → General → Project ID*);
   * the **Project URL** and the **publishable key** (`sb_publishable_…`),
     under the *Connect* button or *Project Settings → API Keys*;
   * a **personal access token**: *Account → Access Tokens → Generate new
     token* (`supabase.com/dashboard/account/tokens`).
3. GitHub, *Settings → Secrets and variables → Actions*:
   * *Secrets* tab: `SUPABASE_ACCESS_TOKEN` (the personal token) and
     `SUPABASE_DB_PASSWORD`;
   * *Variables* tab: `SUPABASE_PROJECT_REF`, `SUPABASE_URL` (the Project
     URL) and `SUPABASE_PUBLISHABLE_KEY`; the last two feed the daily
     keep-alive, because Supabase pauses free projects after a week without
     activity.
4. GitHub, *Actions → Database migrations → Run workflow* with **seed**
   checked (this first time only): the pgTAP suite on a fresh database,
   then `supabase db push --include-seed`, the whole schema plus the 11
   OpenStreetMap places. From then on, every push to `main` that changes
   `supabase/migrations` runs it on its own and applies only the new
   migrations. Local alternative: `supabase link --project-ref <ref>`, then
   `supabase db push --include-seed`.
5. Check: *Table Editor → places* has 11 rows; *Integrations → Cron* lists
   `purge-removed-places` (daily 03:17 UTC). If `pg_cron` was not enabled,
   enable it under *Database → Extensions* and run
   `supabase/migrations/20261021000500_cron.sql` in the SQL editor.

### 4. Google and GitHub sign-in (15 minutes)

Both providers send people back to Supabase, whose callback is shown on
each provider's page in Supabase (*Authentication → Sign In / Providers →
GitHub* or *Google*): `https://<project ref>.supabase.co/auth/v1/callback`.

* **GitHub**: on github.com, *Settings → Developer settings → OAuth Apps →
  New OAuth App*: name `GeoLausanne`, homepage URL the Vercel address you
  are about to create (`https://<name>.vercel.app`, editable later),
  authorization callback URL = the Supabase callback. *Register
  application*, then *Generate a new client secret*. In Supabase's GitHub
  provider: enable, paste the client ID and the secret, save.
* **Google**: `console.cloud.google.com` → create a project → *Google Auth
  Platform → Get started*: app name `GeoLausanne`, your support e-mail,
  audience **External**, contact e-mail. *Branding → Authorized domains*:
  add `<project ref>.supabase.co`. *Data Access*: the scopes `openid`,
  `…/auth/userinfo.email` and `…/auth/userinfo.profile` (non-sensitive: no
  verification). *Clients → Create client*: type **Web application**,
  authorized redirect URI = the Supabase callback. Paste the client ID and
  secret into Supabase's Google provider, enable, save. Finally *Audience →
  Publish app* (status **In production**): in testing mode only listed test
  users can sign in. No logo, or Google asks for a brand verification.

E-mail links stay off for now: Supabase's built-in mailer only reaches the
project's own team, so a public e-mail form would fail for everyone else.
They come later with an SMTP provider ([below](#e-mail-for-sign-in-links)).
The site offers the methods listed in `NEXT_PUBLIC_AUTH_PROVIDERS` (step 5).

### 5. Vercel (5 minutes, then a 3-minute build)

1. `vercel.com`, Hobby plan, signed in with GitHub → *Add New → Project* →
   import `othmanehousni/geolausanne` (if it is not listed, give the Vercel
   GitHub app access to it).
2. **Root Directory: `apps/web`** (*Edit*). Leave the framework (Next.js)
   and the build settings as they are:
   [`apps/web/vercel.json`](../../apps/web/vercel.json) installs the whole
   Bun workspace from the repository root with the pinned Bun 1.4.2
   (`npx bun@1.4.2`, whatever Bun the build image has).
3. The project name becomes the address, `https://<name>.vercel.app`
   (for example `geolausanne`; Vercel adds a suffix if the name is taken).
4. *Environment Variables*, before the first deployment:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (or `NEXT_PUBLIC_SUPABASE_ANON_KEY` with a legacy anon key) |
   | `NEXT_PUBLIC_CITY_BASE_URL` | the city's address from step 2, no trailing slash |
   | `NEXT_PUBLIC_AUTH_PROVIDERS` | `google,github` |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | an address for privacy requests, shown on the privacy and terms pages |

5. *Deploy*, then note the production address (*Domains* on the project
   page).

All variables are `NEXT_PUBLIC_*`, inlined at build time: after changing
one, *Deployments → ⋯ → Redeploy*. The CSP's `connect-src` follows the
Supabase and city URLs by itself. Variables added on the import screen apply
to every environment, so preview deployments (pull requests, Dependabot)
use the real database too; to keep previews in demo mode on the Flon tiles,
untick *Preview* on the two Supabase variables (*Settings → Environment
Variables*). `NEXT_PUBLIC_SITE_URL` is only needed with a custom domain;
on `*.vercel.app` the production address is detected. Every push to `main`
deploys (there is no ignore step: [ADR 0024](../decisions/0024-continuous-backend-deployment.md#update-2026-10-22-no-ignore-command)).
Node.js 22.x or newer (*Settings → Build and Deployment*); the default is
fine.

### 6. Point Supabase at the site (2 minutes)

*Authentication → URL Configuration*: **Site URL**
`https://<name>.vercel.app`; **Redirect URLs**: add
`https://<name>.vercel.app/**` (the callback is
`/<locale>/auth/callback?next=…`, hence the `/**`; add
`https://*-<team>.vercel.app/**` too if previews should sign in). Then
update the GitHub OAuth app's homepage URL if it changed, and optionally
add the address to the Google client's *Authorized JavaScript origins*.

### 7. Check the city

When the City tiles run is green, `https://<city address>/manifest.json`
opens as JSON, and a reload of the site shows the whole agglomeration. No
redeploy is needed: the address was built in at step 5.

### 8. Make yourself admin

Sign in on the site once (Google or GitHub), then in Supabase's *SQL
Editor*:

```sql
update public.profiles set role = 'admin'
 where id = (select id from auth.users where email = 'the-address-you-signed-in-with@example.org');
select display_name, role from public.profiles where role <> 'user';
```

Reload the site: the account menu now has *Moderation*. Name at least one
more moderator the same way
([moderation guide](moderation.md#making-someone-a-moderator)).

### 9. Smoke test

On a phone and a computer: the city loads; a spot opens from the map and
from a shared link; sign in with Google, then with GitHub; add a spot;
vote; write a review; report something and find it in the moderation
console; sign out. The browser console shows no CSP error. Then go through
the [launch checklist](#launch-checklist).

## Go live: what to create, and where each value goes

| Service | Create | Value | Put it in | Kind |
| --- | --- | --- | --- | --- |
| **Supabase** | a project (Free, region Frankfurt) | database password | GitHub secret `SUPABASE_DB_PASSWORD` | secret |
| Supabase | a personal access token | token | GitHub secret `SUPABASE_ACCESS_TOKEN` | secret |
| Supabase | — | project ref (`xxxx` in `xxxx.supabase.co`) | GitHub variable `SUPABASE_PROJECT_REF` | public |
| Supabase | — | Project URL and publishable key | Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; GitHub variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (keep-alive) | public |
| **Cloudflare** | an API token with *Cloudflare Pages: Edit* | token, account id | GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret |
| Cloudflare | — (the City tiles run creates the project and prints its address) | `https://geolausanne-city.pages.dev` | Vercel `NEXT_PUBLIC_CITY_BASE_URL` | public |
| **GitHub** and **Google** | an OAuth app / an OAuth client | client id and secret | Supabase → Authentication → Sign In / Providers; then Vercel `NEXT_PUBLIC_AUTH_PROVIDERS=google,github` | secret (in Supabase only) |
| **Vercel** | an account (Hobby) and a project importing the repository, root `apps/web` | the production address | Supabase → Authentication → URL Configuration | public |
| You | an address for privacy requests | e-mail | Vercel `NEXT_PUBLIC_CONTACT_EMAIL` | public |
| Resend or Brevo (later, for e-mail links) | an SMTP key and a verified sender | SMTP host, user, key | Supabase → Authentication → Emails → SMTP; then add `email` to `NEXT_PUBLIC_AUTH_PROVIDERS` | secret (in Supabase only) |
| Cloudflare Turnstile (optional, with e-mail links) | a widget | site key, secret key | Vercel `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; Supabase → Attack protection | site key public, secret in Supabase |

## E-mail for sign-in links

Supabase's built-in mailer **only delivers to members of the project's team
and is limited to a few messages per hour**: fine for testing,
unusable for a public site. That is why the site launches with Google and
GitHub only. To add e-mail links later, use a free SMTP provider:

| Provider | Free tier (at the time of writing) | SMTP |
| --- | --- | --- |
| Resend | 3 000 e-mails/month, 100/day, 1 domain | `smtp.resend.com`, port 465, user `resend`, password = an API key |
| Brevo | 300 e-mails/day | `smtp-relay.brevo.com`, port 587, your SMTP login and key |

1. Verify a sending domain with the provider (SPF and DKIM DNS records;
   Resend requires a domain, and any provider delivers better with one).
2. Supabase: *Authentication → Emails → SMTP settings*: enable custom SMTP,
   sender `GeoLausanne <no-reply@your-domain>`, host, port, user, password.
3. Raise *Authentication → Rate limits → e-mails sent per hour* to a
   sensible value (e.g. 30).
4. Vercel: `NEXT_PUBLIC_AUTH_PROVIDERS=email,google,github`, then redeploy.
   The sign-in dialog shows the e-mail form under the provider buttons.
5. Test with an address that is **not** a team member.

## City tiles on Cloudflare Pages

The **City tiles** workflow (`.github/workflows/city.yml`, run by hand):

1. When deploying, checks the Cloudflare secrets and creates the Pages
   project on the first run
   ([`scripts/cloudflare-pages-project.sh`](../../scripts/cloudflare-pages-project.sh)),
   so a wrong token fails in seconds rather than after the build (`wrangler
   pages deploy` does not create a missing project when it runs in CI). The
   run's summary gives the address.
2. Builds the area: `agglomeration` (the default: Lausanne and its 15
   neighbours) downloads ~1.8 GB of source data and builds 10 540 tiles +
   horizon (10 543 files, ~349 MB, well under the 20 000-file limit of the
   free plan); `lausanne` builds the municipality alone; `flon` the demo.
   Budget 1–2 hours on a private repository's 2-CPU runner, about half on a
   public one's 4 CPUs.
3. Compresses the tiles (meshopt + gzip), adds `_headers` and publishes them
   with `wrangler pages deploy`. With deploy unchecked the result is kept as
   a workflow artifact for 3 days instead.

The workflow was test-run on GitHub on 2026-10-21 with area `flon` and
deploy unchecked (every step except the upload): 5 minutes, 184 files,
11.1 MB, identical to the committed demo.

**Deploy the web app first** when the tiles change format (format 2 since
the colour model, [ADR 0025](../decisions/0025-colour-model-from-open-data.md)):
the current app draws formats 1 and 2, an older app refuses format 2. A
custom domain such as `city.your-domain` can be added under the Pages
project's *Custom domains*.

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

## Turnstile (optional)

A bot check on the e-mail form; useful once e-mail links are on (OAuth
sign-in has the providers' own protection). Cloudflare dashboard →
*Turnstile → Add widget* for your domain(s) (managed mode). Site key →
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Vercel; secret key → Supabase
*Authentication → Attack protection → CAPTCHA* (provider Cloudflare
Turnstile). Enable both together, or e-mail sign-in fails.

## Domain (optional, the only cost)

Add it to the Vercel project, then update: Supabase Site URL and redirect
URLs, `NEXT_PUBLIC_SITE_URL`, the GitHub OAuth app's homepage, the Google
client's JavaScript origins, the Turnstile widget's domains, and the SMTP
sending domain. A subdomain for the tiles (`city.…`) is optional.

## Launch checklist

* [ ] Repository **public** (the site links to its source code and, without
      a contact e-mail, to GitHub issues), or `NEXT_PUBLIC_CONTACT_EMAIL` set
      and the links accepted as they are.
* [ ] Migrations applied, seed loaded once, cron job listed.
* [ ] Google and GitHub sign-in tested with an account outside the Supabase
      team; e-mail links listed only once SMTP is configured and tested.
* [ ] Site URL and redirect URLs match the production address.
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
| App code | push to `main` (Vercel deploys every push); CI must be green |
| Schema | new migration file → CI pgTAP → merged to `main`, the *Database migrations* workflow applies it |
| City data (new OSM/swisstopo editions, pipeline changes) | run *City tiles*; no app redeploy needed |
| A `NEXT_PUBLIC_*` variable | change it on Vercel, then *Redeploy* |
| Rules (thresholds, limits) | `update private.settings …` in the SQL editor; update `apps/web/src/lib/data/rules.ts` for the texts |
