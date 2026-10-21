# Decision records

Every significant choice made while building GeoLausanne, with its context,
the alternatives that were weighed and the consequences. They were all made
on 20–21 October 2026, during the first build of the project, under three
constraints set by the project owner: implement the blueprint's six
milestones completely, use nothing that has to be paid for (a domain name
excepted), and follow accessibility best practices with Base UI primitives.

| # | Decision | Area |
| --- | --- | --- |
| [0001](0001-monorepo-and-tooling.md) | Bun monorepo: Next.js app, shared geo types, Python pipeline, Supabase | tooling |
| [0002](0002-react-three-fiber.md) | three.js through React Three Fiber, WebGL | rendering |
| [0003](0003-offline-voxelization-and-quadtree.md) | Voxelise offline into a quadtree of 128-voxel tiles at four levels | pipeline, streaming |
| [0004](0004-tile-hosting.md) | Host the city on Cloudflare Pages; commit only the Flon demo | hosting |
| [0005](0005-openstreetmap-for-surfaces.md) | OpenStreetMap instead of swissTLM3D for surfaces | data |
| [0006](0006-trees-from-the-surface-model.md) | Detect every tree from the surface model | data |
| [0007](0007-lake-from-the-terrain-model.md) | Take Lake Geneva from the terrain model | data |
| [0008](0008-supabase-rpc-and-rls.md) | Supabase, writes and reads only through RPCs, RLS everywhere | backend |
| [0009](0009-community-removal-rule.md) | Remove a spot at ≥ 5 downvotes and a score ≤ −5, reversibly | product, backend |
| [0010](0010-passwordless-auth.md) | E-mail links and optional OAuth, no passwords | auth |
| [0011](0011-internationalisation.md) | French first, English second, prefixed static URLs | frontend |
| [0012](0012-demo-mode.md) | A browser-only demo backend with the same rules | frontend, testing |
| [0013](0013-swisstopo-geocoding.md) | swisstopo GeoAdmin API for search and addresses | frontend |
| [0014](0014-ui-stack.md) | Base UI via shadcn, Phosphor icons, recreated pro components | design |
| [0015](0015-accessible-3d-map.md) | The 3D map as an ARIA application region with a list alternative | accessibility |
| [0016](0016-privacy-by-default.md) | Privacy by default: no tracking, pseudonyms, local location | privacy |
| [0017](0017-roof-colours-from-roof-shape.md) | Roof colours from roof shape plus orthophoto (superseded by 0025) | pipeline |
| [0018](0018-free-tier-only.md) | Free tiers only; what that implies | operations |
| [0019](0019-root-layout-under-locale.md) | Root layout under `[locale]`, global not-found | frontend |
| [0020](0020-own-tile-decoder-in-workers.md) | Our own tile decoder in a worker pool instead of GLTFLoader | streaming |
| [0021](0021-meshopt-and-gzip.md) | meshopt + gzip instead of Draco or CDN compression | pipeline, streaming |
| [0022](0022-ci-and-deployment-workflows.md) | Checks on every push; city and database deployments by hand (database part superseded by 0024) | operations |
| [0023](0023-diorama-design-system.md) | "Diorama": Geist, pixel accents and islands over the city | design |
| [0024](0024-continuous-backend-deployment.md) | Migrations deploy on main after their tests; a pinned Vercel install; a keep-alive | operations |
| [0025](0025-colour-model-from-open-data.md) | Colours from open data (orthophoto, building register, OSM) on a pixel-art palette | pipeline, rendering |
| [0026](0026-pixel-art-rendering-and-real-sky.md) | Pixel-art rendering under Lausanne's real sky | rendering |

## Format

```
# NNNN. Title

Status: accepted | superseded by NNNN   ·   Date: YYYY-MM-DD

## Context        what forced a decision
## Decision       what we do
## Alternatives   what else was considered and why not
## Consequences   what follows, good and bad
```

New decisions get the next number. A decision that changes is not edited
away: write a new record and mark the old one "superseded by".
