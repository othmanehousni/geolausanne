# GeoLausanne documentation

A voxelised 3D Lausanne where the community maps halal food spots, votes on
them and reviews them. These pages are the project's memory: what was built,
how it works, why each decision was made, and how to run it.

## Start here

* [overview.md](overview.md): what the product does, milestone status, what is
  left for the owner
* [getting-started.md](getting-started.md): run it locally in two commands
  (demo mode), environment variables, scripts

## How it works

| Area | Pages |
| --- | --- |
| Architecture | [overview](architecture/README.md) · [web app](architecture/frontend.md) · [streaming and LOD](architecture/streaming-and-lod.md) · [rendering](architecture/rendering.md) |
| Geodata pipeline | [overview](pipeline/README.md) · [data sources](pipeline/data-sources.md) · [coordinate system](pipeline/coordinate-system.md) · [voxelization](pipeline/voxelization.md) · [materials](pipeline/materials.md) · [tile format](pipeline/tile-format.md) · [horizon](pipeline/horizon.md) |
| Backend | [data model and API](backend/data-model.md) · [accounts and sign-in](backend/auth.md) |
| Design | [design system](design/design-system.md) · [accessibility](design/accessibility.md) · [components](design/components.md) |

## Why it is this way

* [decisions/](decisions/README.md): 22 decision records (renderer, offline
  voxelisation, hosting, data sources, database security, the removal rule,
  auth, i18n, demo mode, UI stack, accessibility, privacy, free tiers, …)
* [research/](research/README.md): the blueprint reviewed point by point, the
  UI component survey, and every finding made while building

## Running it

* [operations/deployment.md](operations/deployment.md): Supabase, Cloudflare
  Pages, Vercel, e-mail, OAuth, Turnstile, launch checklist
* [operations/runbook.md](operations/runbook.md): routine tasks and incidents
* [operations/moderation.md](operations/moderation.md): moderator guide
* [operations/privacy.md](operations/privacy.md): data inventory, processors,
  requests
* [operations/testing.md](operations/testing.md): test suites, CI, manual checks
* [operations/performance.md](operations/performance.md): sizes, first-view
  measurements, levers
* [legal/data-licensing.md](legal/data-licensing.md): licences and attribution

## Conventions of these docs

* Facts are taken from the code and from measurements made on 21 October
  2026; numbers name the build they come from (city version `0d885f38502f`,
  Flon demo `fef715809343`).
* Paths are relative to the repository root.
* When a decision changes, add a new record and mark the old one
  "superseded"; when the code changes, update the page that describes it in
  the same pull request.
