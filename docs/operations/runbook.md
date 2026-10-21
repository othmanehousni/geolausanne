# Runbook

Routine operations and what to do when something breaks. Deployment steps
are in [deployment.md](deployment.md), moderation in [moderation.md](moderation.md).

## Routine

| When | Task |
| --- | --- |
| daily (early weeks), then weekly | moderation console: reports, removals, log |
| monthly | merge Dependabot updates once CI is green (GitHub Actions monthly, npm minor/patch weekly, pip monthly) |
| every few months | rebuild the city (*City tiles* workflow) to pick up new OpenStreetMap edits and swisstopo editions |
| when OSM halal tags change a lot | regenerate the seed (`python -m geovox seed-places …`) for new deployments; the live database is not reseeded (community data wins) |
| yearly | review the privacy policy and terms against what the app does |

**Major dependency upgrades** (Next.js, React, TypeScript, ESLint, three.js,
Tailwind, Base UI…) are not proposed by Dependabot; do them by hand in a
branch: read the upgrade guide, run `bun run typecheck && bun run lint &&
bun run test && bun run build && bun run test:e2e`, check the map visually.

## The database is paused

Supabase pauses free projects after 7 days without requests. Symptoms: spots
do not load, sign-in fails, the console shows network errors to
`*.supabase.co`. Fix: Supabase dashboard → the project → **Restore/Resume**
(a few minutes). Data is kept. Regular visitors prevent pausing.

## Sign-in e-mails do not arrive

1. Supabase → *Authentication → Logs*: errors from the SMTP provider?
2. Is custom SMTP enabled? The built-in mailer only sends to team members, 2
   per hour.
3. Provider dashboard: domain still verified (SPF/DKIM), daily quota left
   (Resend 100/day, Brevo 300/day on the free tiers)?
4. Supabase's own limit (*Rate limits → e-mails per hour*).
5. Meanwhile, OAuth sign-in (if enabled) still works.

## "Could not load the city"

1. Open `NEXT_PUBLIC_CITY_BASE_URL` + `/manifest.json` in a browser. 404 →
   the Pages project was deleted or renamed: re-run *City tiles* and check
   the variable on Vercel.
2. CORS or CSP errors in the console → `_headers` missing from the
   deployment (re-run the workflow), or the city URL changed without a Vercel
   redeploy (the CSP is computed at build time).
3. Tiles 404 but the manifest loads → a partial deployment; re-run the
   workflow.

## Spots disappear unexpectedly

* Check the moderation **log**: `auto_remove` entries show the score and
  downvotes at removal time. A burst of removals suggests a coordinated
  campaign: restore legitimate spots (they become protected), suspend the
  accounts involved (`private.vote_events` has the history:
  `select * from private.vote_events where created_at > now() - interval '1 day' order by created_at;`).
* Consider raising `removal_min_downvotes` temporarily
  ([changing the rules](moderation.md#changing-the-rules)).

## Abuse: floods of new spots or reviews

Rate limits apply per account (5 spots and 20 reviews per day). For many new
accounts: enable Turnstile ([deployment](deployment.md#5-turnstile-optional)),
lower Supabase's sign-up rate limits, suspend accounts, hide content.

## CI is red

* **web / e2e**: open the uploaded `playwright-report` artifact (traces).
  Timeouts on CI but not locally usually mean CPU starvation (software
  WebGL on 2 cores): reproduce with `taskset -c 0,1 bun run test:e2e`.
* **database**: run `bash scripts/test-db.sh` locally against PostgreSQL 16 +
  PostGIS + pgTAP; the output names the failing assertion.
* **pipeline**: `pytest -x` in `pipelines/geodata`.

## Restoring data

Export regularly if the data matters: `supabase db dump --data-only -f
backup.sql` (with the project linked), or the dashboard's backup options for
your plan. Restore into a fresh project by applying the migrations, then the
data dump.

## Rotating credentials

| Secret | Where | Rotate by |
| --- | --- | --- |
| Supabase publishable key | Vercel env | create a new key in Supabase, update Vercel, redeploy, revoke the old one |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | GitHub secrets | regenerate in Supabase, update the secrets |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | roll the token in Cloudflare, update the secret |
| SMTP password / API key | Supabase SMTP settings | create a new key at the provider, update Supabase |
| OAuth client secrets | Supabase providers | regenerate at Google/GitHub, update Supabase |
| Turnstile secret | Supabase CAPTCHA settings | rotate in Cloudflare, update Supabase |

No secret is stored in the repository or in client code (all `NEXT_PUBLIC_*`
values are public by design).
