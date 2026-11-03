# @geolausanne/web

The GeoLausanne web app: Next.js 16 (App Router), React 19, React Three
Fiber, Base UI (shadcn "base-nova"), Phosphor icons, Tailwind CSS v4,
next-intl, TanStack Query, zustand, supabase-js.

```bash
bun dev                 # from the repository root, http://localhost:3000
bun run build && bun run start
bun run test            # Vitest (jsdom)
bun run test:e2e        # Playwright + axe, after a build
```

Configuration: copy [`.env.example`](.env.example) to `.env.local` (all
optional; without Supabase the app runs in demo mode).
[`.env.development`](.env.development) points `bun dev` at the published
city; production builds use the bundled demo city unless
`NEXT_PUBLIC_CITY_BASE_URL` says otherwise.

| Path | Contents |
| --- | --- |
| `src/app/[locale]` | routes; this is the root layout ([why](../../docs/decisions/0019-root-layout-under-locale.md)) |
| `src/components/map` | the map screen: top bar, search, toolbar, bottom bar, map region, status |
| `src/components/world` | the R3F scene: tiles, horizon, camera, atmosphere, markers |
| `src/components/place` | spot panel, votes, reviews, reports, submit form, spots list |
| `src/components/auth`, `moderation`, `form`, `layout`, `ui` | sign-in, moderation console, form helpers, content pages, primitives |
| `src/lib/world` | LOD selection, tile store, worker, decoder, materials, picking |
| `src/lib/data` | repository contract, Supabase and demo backends, query hooks, rules |
| `src/stores` | zustand stores shared with the canvas |
| `messages` | `fr.json`, `en.json` |
| `e2e` | end-to-end tests |
| `public/city/flon` | the committed demo city |

Documentation: [web app architecture](../../docs/architecture/frontend.md),
[streaming](../../docs/architecture/streaming-and-lod.md),
[rendering](../../docs/architecture/rendering.md),
[design system](../../docs/design/design-system.md).

`AGENTS.md` is written by `next dev` for coding assistants (Next.js 16 has
breaking changes); keep it.
