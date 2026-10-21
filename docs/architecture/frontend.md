# The web app

`apps/web`: Next.js 16.4 (App Router, Turbopack, React 19.3, React Compiler
lint rules), Tailwind CSS v4, Base UI + shadcn components, next-intl,
zustand, TanStack Query, three.js / React Three Fiber.

## Routes

| Path | Rendering | Notes |
| --- | --- | --- |
| `/` and any un-prefixed path | proxy redirect | `src/proxy.ts` (next-intl): cookie, then `Accept-Language`, to `/fr` or `/en` |
| `/[locale]` | static | the map: `MapExperience` (overlay UI) + `WorldCanvas` (client-only 3D) |
| `/[locale]?spot=<id>` | same page | deep link to a spot, kept in sync with `history.replaceState` |
| `/[locale]/about` | static | what, how, data sources with licences, credits |
| `/[locale]/privacy`, `/[locale]/terms` | static | legal texts written for what the app really does |
| `/[locale]/moderation` | static shell, `noindex` | moderation console; content requires a moderator session |
| `/[locale]/auth/callback` | static, `noindex` | sign-in landing ([auth](../backend/auth.md)) |
| `/[locale]/[...rest]` | `notFound()` | localized 404 (`[locale]/not-found.tsx`) |
| anything else | `global-not-found.tsx` | bilingual 404 for URLs outside the locale tree |
| `/[locale]/opengraph-image` | generated | social preview image per locale |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, icons | generated | sitemap with hreflang alternates; robots disallow moderation and auth |

`next build` prerenders every page as static HTML (Cache Components are on;
no route reads cookies or headers), so pages are served from the CDN and the
proxy only runs for un-prefixed URLs.

**Root layout under `[locale]`.** `next/root-params` only exposes params of
the root layout, so `app/[locale]/layout.tsx` *is* the root layout (there is
no `app/layout.tsx`), and `experimental.globalNotFound` provides a 404 for
URLs outside it. See [ADR 0019](../decisions/0019-root-layout-under-locale.md).

## Internationalisation

next-intl 4, locales `fr` (default; Lausanne is French-speaking) and `en`
(students, visitors), `localePrefix: "always"`. Messages live in
`messages/fr.json` and `messages/en.json`; a unit test checks that both
define the same keys and the same placeholders and rich-text tags. Every page calls `setRequestLocale` so it stays static. Metadata
uses `alternatesFor(locale, path)`: canonical URL plus `hreflang` alternates
and `x-default` (French). The language switch in the account menu keeps the
current page. Long legal texts are plain JSX per locale
(`src/content/legal.tsx`) rather than translation keys.
[ADR 0011](../decisions/0011-internationalisation.md).

## State

| Store | Holds | Why a store |
| --- | --- | --- |
| `world-store` (zustand) | manifest, quality, reduced motion, night, streaming stats, camera command queue, render/manifest errors, user location | shared between the DOM overlay and the R3F canvas, which renders in its **own React root** (context does not cross it) |
| `ui-store` | selected spot, list/sheet state, placement mode and picked location, auth dialog state and continuation, theme | same reason; also lets non-React code (keyboard handlers) act |
| `places-store` | places currently loaded for the map, hovered id | the canvas reads them every frame |
| `announcer-store` | the latest polite announcement | one live region for the whole app |

**Server data** goes through TanStack Query (`lib/data/hooks.ts`): places in
the current area, a place, reviews, search, nearby places, mutations with
optimistic votes and cache updates. Defaults: 30 s stale time, no refetch on
window focus, one retry for queries, none for mutations.

## Data layer

`lib/data/repository.ts` defines one contract used by every component.
`getRepository()` returns:

* **`SupabaseRepository`** when `NEXT_PUBLIC_SUPABASE_URL` and a key are set:
  supabase-js calls to the RPCs, errors mapped to stable codes;
* **`DemoRepository`** otherwise: the same rules implemented in the browser
  (duplicates within 40 m, no voting on your own spot, removal thresholds, one
  review per user and spot, moderation), stored in `localStorage`
  (`geolausanne-demo-v1`), seeded with the 11 OpenStreetMap places. It makes
  the whole product usable without any account, in development, previews and
  end-to-end tests. [ADR 0012](../decisions/0012-demo-mode.md).

`lib/geo/geocoder.ts` talks to the swisstopo GeoAdmin API (search and
reverse geocoding; [ADR 0013](../decisions/0013-swisstopo-geocoding.md)).

## Main components

| Area | Components |
| --- | --- |
| Shell | `MapExperience`, `TopBar` (brand + `SearchBox` + `AccountMenu`), `MapToolbar`, `BottomBar`, `Attribution`, `LiveRegion`, `MapStatus` |
| Map region | `MapRegion` (role `application`, keyboard model), `WorldCanvas`, `MapSync` (places in view, deep links) |
| Spots | `PlacePanel` (drawer), `PlaceDetails`, `VoteControl`, `HalalBadges`, `Reviews`, `ReviewForm`, `StarRating`, `ReportDialog`, `ModeratorTools`, `SpotsList` |
| Contributing | `AddSpotFlow` (placement banner), `SubmitPlaceDialog` (form, address suggestion, duplicates) |
| Accounts | `AuthDialog`, `Turnstile`, `ProfileDialog`, `AuthCallback` |
| Moderation | `ModerationConsole` (tabs: reports, removed, hidden, log) |
| Content pages | `ContentPage` (header, footer, prose) |
| Primitives | `components/ui/*` (shadcn "base-nova" on Base UI), `components/form/*` (Field/Fieldset wrappers, `ChoiceCards`) |

Component and primitive choices: [design/components.md](../design/components.md).

## Errors and empty states

* Backend errors carry a code (`rate_limited`, `duplicate_place`, …) mapped
  to friendly sentences in both languages by `useErrorMessage`.
* The submit form lists spots within 60 m with a button to open them; when
  the server rejects a duplicate, that list is refreshed so the existing spot
  is one tap away.
* Votes are optimistic and roll back with an error toast.
* No WebGL, a crashed canvas or an unreachable city each get an explanatory
  card; the spots list keeps working in every case.
* Long operations show a spinner only after a short delay (`useDelayedFlag`)
  so fast responses do not flash.

## Security headers

Set in `next.config.ts` for every route:

* `Content-Security-Policy` (production): `default-src 'self'`; scripts from
  self, inline (Cache Components prerender a static shell, so nonces are not
  possible), `'wasm-unsafe-eval'` for the meshopt decoder and Turnstile;
  `connect-src` limited to self, the GeoAdmin API, Turnstile, the configured
  Supabase origin (https + wss) and the city CDN; `worker-src 'self' blob:`;
  `frame-ancestors 'none'`; `object-src 'none'`; `upgrade-insecure-requests`.
* `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy:
  same-origin`, `Permissions-Policy` allowing only geolocation (self).
* `/city/*` (bundled demo tiles): one-year immutable cache and CORS; the
  manifest revalidates on every request.

## SEO and sharing

Per-locale titles and descriptions, canonical and `hreflang` alternates,
generated Open Graph images, a sitemap of the public pages, a web app
manifest and icons (SVG, Apple touch icon, 512 px PNG), and `noindex` on
moderation and auth pages.

## Tooling

* `bun run typecheck` = `next typegen && tsc --noEmit` (route types must
  exist before `tsc`).
* ESLint 9 with `eslint-config-next`, React Compiler rules and
  `jsx-a11y` recommended rules. `react-hooks/immutability` is off for
  `src/components/world` only: R3F code mutates three.js objects every frame
  by design.
* Vitest + Testing Library (jsdom) for units and components, Playwright +
  axe for end-to-end ([testing](../operations/testing.md)).
