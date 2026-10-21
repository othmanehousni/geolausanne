# Findings

Things learned while building, each with its consequence. Most were found by
measuring or by a failing test; the fix is in the code and, where it is a
decision, in an ADR.

## Geodata

| # | Finding | Consequence |
| --- | --- | --- |
| 1 | swissBUILDINGS3D `Building_solid` geometries are **not consistently wound**: part of them are inside-out. | Each solid is oriented with the sign of its volume before normals are read ([materials](../pipeline/materials.md)). |
| 2 | Orthophoto samples of roofs are nearly neutral at 2 m (median CIELAB chroma **4.9** on 4 366 Flon buildings); nearest-colour matching gave **83 % grey** roofs. | Roof shape (share of pitched area) became the prior; the photo picks the shade ([ADR 0017](../decisions/0017-roof-colours-from-roof-shape.md)). |
| 3 | A regional OSM extract **cannot assemble the Lake Geneva multipolygon** (it spans France and Geneva); the first builds had no lake. | The lake comes from the terrain model, which stores it flat at ~372.13 m ([ADR 0007](../decisions/0007-lake-from-the-terrain-model.md)). |
| 4 | The swissBOUNDARIES3D municipality polygon **includes Lausanne's share of the lake** (67.63 km² vs **41.36 km²** of land), and OSM only yielded ponds to subtract, so 9 % of level 0–1 tiles were open water. | The detailed region subtracts the open lake detected in the terrain model and is clipped to the detail box: 6 814 → **6 482** tiles; the computed land area matches the official 41.37 km². |
| 5 | GEOS (Shapely) cannot represent `TIN Z` geometries from the File Geodatabase. | Triangles are parsed straight from WKB after an `ogr2ogr` conversion to GeoPackage. |
| 6 | swissTLM3D is only distributed as one national archive per edition (**4.8 GB** zipped GeoPackage). | OpenStreetMap is the surface source ([ADR 0005](../decisions/0005-openstreetmap-for-surfaces.md)). |
| 7 | The GeoAdmin SearchServer returns `x` = northing, `y` = easting. | The geocoder swaps them; a unit test pins it. |
| 8 | Rounding heights to voxel levels leaves single-voxel islands along x.5 m contours; per-pixel orthophoto classes make noisy, heavy meshes. | Small regions are merged after quantisation; the orthophoto base is mode-filtered. |
| 9 | Forests stamped tree by tree at 4–8 m voxels look like noise and mesh badly. | Dense forest becomes one canopy volume on levels 1–3; instanced trees on level 0 ([ADR 0006](../decisions/0006-trees-from-the-surface-model.md)). |

## Rendering and streaming

| # | Finding | Consequence |
| --- | --- | --- |
| 10 | Water ripples and glints alias into a grid of white dots far from the camera. | They fade out between 250 m and 900 m. |
| 11 | GLSL reserves identifiers starting with `gl_`: a shader helper named `gl_hash13` failed to compile ("reserved built-in name"). | Renamed `vxHash13`. |
| 12 | drei's `<Html>` owns its own React root; unmounting it during a render (React 19) caused `removeChild` errors and half-closed dialogs. | Name tags stay mounted, only their text changes; positions update in the frame loop. |
| 13 | drei's `<AdaptiveDpr>` does nothing unless something calls `performance.regress()`; nothing did. | Removed. |
| 14 | A `PerformanceMonitor` quality step recreated the tile store, so the whole city reloaded on slow devices. | Quality changes now adjust budget and concurrency in place (`TileStore.setLimits`). |
| 15 | `PerformanceMonitor` would read the sparse frames of on-demand rendering as a slow device. | It is unmounted while a modal covers the map. |
| 16 | The full municipality's first view (desktop, high quality) needs 144 tiles, 10.3 MB and 107 MB of GPU geometry; a low-end phone 72 tiles, 5.4 MB, 56 MB. | Budgets of 400/220/120 MB leave headroom ([performance](../operations/performance.md)). |

## Platform and libraries

| # | Finding | Consequence |
| --- | --- | --- |
| 17 | Next.js 16: `next/root-params` only exposes the **root** layout's params ("Export locale doesn't exist"). | `app/[locale]/layout.tsx` is the root layout; `global-not-found` for the rest ([ADR 0019](../decisions/0019-root-layout-under-locale.md)). |
| 18 | Next.js 16 renamed `middleware` to `proxy`; nonce-based CSP is incompatible with Cache Components' static shell; `tsc` needs `next typegen` first. | `src/proxy.ts`; CSP without nonces (`'wasm-unsafe-eval'` for meshopt); `typecheck` script runs typegen. |
| 19 | Base UI drawers: swapping the desktop panel for the mobile sheet after hydration opened the sheet at full height. | The media-query hook returns `null` until hydrated; drawers render only once the layout is known. |
| 20 | Base UI `RadioGroup` inside one `Field`: every radio was named after the first card's label. | `Field.Item` per option (caught by an end-to-end test). |
| 21 | A Base UI drawer is named by its `Drawer.Title`; an extra `aria-label` overrode the spot's name. | `aria-label` removed; tests look panels up by the spot's name. |
| 22 | Cloudflare Pages **joins** the values of every `_headers` rule matching a path. | `Cache-Control` is set per path, never on `/*` ([ADR 0004](../decisions/0004-tile-hosting.md)). |
| 23 | Supabase's built-in mailer only sends to project team members, 2 messages per hour. | Free SMTP provider required for launch ([deployment](../operations/deployment.md#e-mail-for-sign-in-links)). |
| 24 | The sign-in callback is locale-prefixed with a query string; exact redirect URLs do not match it. | Redirect allow-lists use `/**` globs (local config fixed). |
| 25 | Supabase free projects pause after 7 days without requests. | Documented in the runbook. |

## Testing and CI

| # | Finding | Consequence |
| --- | --- | --- |
| 26 | The CI database job connects as the runner's own superuser, which the profile guard did not recognise (`forbidden` before any test ran). | Superusers are exempt (they bypass RLS anyway). |
| 27 | On a 2-core runner, SwiftShader rendering the city every frame starved the page: a dialog could take > 15 s to close, and two browsers in parallel missed the 60 s first-view budget. | The city renders on demand while a modal covers it (resuming after the exit transition); CI runs one browser at a time; long dialog flows are `test.slow()`. Reproduced locally with `taskset -c 0,1`. |
| 28 | Dependabot proposed TypeScript 7, ESLint 10 and @types/node 26 (majors, failing CI). | npm majors are ignored by Dependabot and upgraded by hand. |
| 29 | A test typed into the search box before React had hydrated: the text never reached state (1 run in 20 failed on two cores). | Tests wait for the client-only canvas before typing (`waitForInteractive`); 20/20 pass. |

## Repository hygiene

| # | Finding | Consequence |
| --- | --- | --- |
| 30 | `motion` and `@supabase/ssr` were dependencies but never imported. | Removed. |
| 31 | `apps/web/.gitignore` ignored every `.env*`, including the example file. | `!.env.example`; the example documents every variable. |
| 32 | The project declared MIT everywhere but had no `LICENSE` file. | Added. |
| 33 | French and English message files were kept in sync by hand. | A unit test now checks keys, placeholders and rich-text tags. |

## Second pass

After the first delivery, five independent reviews audited the work again:
the backend and data layer, the 3D streaming code, and the interface with
the parts of the owner's design skills not applied the first time (Emil
Kowalski's `break-ui`, `review-animations`, `improve-animations`,
`animation-performance` and `apple-design`; *Make Interfaces Feel Better*'s
typography, icons and animation chapters). Every finding below was
reproduced (SQL sessions, scripted browsers, simulations of the real
modules) before it was fixed; the fixes carry tests that fail on the old
code.

### Backend and data

| # | Finding | Consequence |
| --- | --- | --- |
| 34 | Concurrent votes lost counts: the recount trigger read a snapshot taken before a parallel vote committed, so two simultaneous upvotes were stored as one, and four downvotes plus a simultaneous upvote and downvote removed a spot with a score it never had. Reviews had the same race. | The triggers lock the place row in a statement of its own before recounting ([`04_concurrency_test.sql`](../../supabase/tests/04_concurrency_test.sql), which fails 3/3 on the old schema). |
| 35 | Every rate limit counted committed rows, so parallel requests all passed: 40 simultaneous submissions created 38–40 spots against a limit of 5. | A transaction-scoped advisory lock per member (`private.lock_user_writes`) serialises limited writes. |
| 36 | The sign-in callback accepted `/%09/evil.example`: browsers strip tabs and newlines from URLs, turning it into `//evil.example`, an open redirect. | `safeNext` resolves the value like the browser and checks the origin. |
| 37 | Authors could undo a moderator's "hide review" by deleting and re-posting it; deleting a reported review also deleted its reports. | Hidden reviews cannot be deleted by their author; reports keep a copy of the review's text and author. |
| 38 | A spot removed by the community could be submitted again at once. | `recently_removed` during the 14-day grace period; moderators restore instead. |
| 39 | A column grant let visitors list every member's id, role and sign-up date. | No table grant on `profiles`; names come through the RPCs only. |
| 40 | The vote log outlived account deletion, against the privacy policy. | Foreign key with cascade, and a 30-day retention job. |
| 41 | "Future functions are private until granted" was false: PostgreSQL's EXECUTE-to-PUBLIC default is global and a per-schema rule cannot remove it. A global revoke was tried and rejected (it strips extensions installed later, pgTAP included). | Each migration revokes its functions explicitly, and a test asserts the exact list of functions visitors and members can call. |
| 42 | The terms promise that moderators can suspend accounts, but no screen could; moderators never see member ids. | "Suspend the author" (7 or 30 days, or lift) on each report, resolved on the server (`mod_suspend_author`). |
| 43 | Smaller rule gaps: authors could review and halal-confirm their own spot; hide/show made an old confirmation look fresh; the review limit blocked corrections; reviews of hidden spots stayed listed; raising the halal level kept a verification; verifying overwrote the claim. | Each fixed in `000600`, with an assertion in `03_hardening_test.sql`. |
| 44 | The forms accepted values the database cut or refused: 8 cuisine tags (constraint error), descriptions of 1 000 characters (stored 600), names of 120 (stored 80), a website with a space (refused). | One table of field limits (`FIELD_LIMITS`) feeds the forms, the demo backend and matches the SQL; URLs are normalised before sending. |
| 45 | A spent Turnstile token was reused after a failed sign-in, so every retry failed. | The widget is rendered afresh after each attempt. |

### Interface: motion and craft

| # | Finding | Consequence |
| --- | --- | --- |
| 46 | The add-spot dialog transitioned `transform`, but Tailwind's offset utilities set the separate `translate` and `scale` properties: it never rose on open and dropped 32 px before fading on close. | `transition-[translate,scale,opacity]`, documented in the design system. |
| 47 | Drawers, the phone sheet and toasts kept sliding under reduced motion (the global rule only shortened keyframe animations). | They fade in place; the phone sheet keeps its peek height. |
| 48 | The "Use map centre" crosshair was drawn 370 px below the point being picked, and the no-WebGL error card rendered mostly off-screen: both were laid out inside the bottom bar's container. | Fixed positioning relative to the viewport (the card only after the edge-case audit, #71). |
| 49 | Every custom focus ring (50 % opacity) and the star ratings were below the 3:1 non-text contrast; field outlines were at 1.4:1. | Rings at 80 %, a darker `rating` colour, `input` outlines at 52 % / 38 % (all ≥ 3.2:1, computed from the tokens). |
| 50 | The same filled seal meant "certificate claimed", "verified by a moderator" and "a member checked"; the shield also meant "moderation". | One meaning per icon: shield = verified, certificate = claimed, check circle = member check, gavel = moderation. |
| 51 | The compass needle spun 345° the wrong way when the heading crossed north. | The angle is unwrapped; a linear transition matches the 4 Hz heading updates. |
| 52 | Tooltips and menus animated even when Base UI marked the opening as instant; keyframe overlays used the browser's weak `ease` and, through `duration-*`, a hidden `transition: all`. | `data-instant:animate-none`, the project's ease-out curve, `animation-duration-*`. |
| 53 | Layout gaps on real devices: no left/right safe areas (landscape notch), toasts in the home-indicator zone, the toolbar overlapping the account button on short landscape screens, the side panel covering the bottom bar between 48 and 80 rem. | Safe areas on all sides, a shorter toolbar under 32 rem of height, the bottom bar moves right of an open panel. |
| 54 | 25 of the 36 installed shadcn primitives were never imported (drawers, tabs and radios use Base UI directly), and several carried motion defects. | Removed; `bunx shadcn add` brings one back. |

### World (3D)

| # | Finding | Consequence |
| --- | --- | --- |
| 55 | Pointer and touch controls died for the rest of the visit when the camera rig re-rendered during a gesture: an inline `onStart` made drei rebuild the controls, and three-stdlib lost the pointer release. | A stable callback; a regression test drives a real R3F root and drei's controls. |
| 56 | Keyboard and toolbar steps were 600–1 600 ms tweens restarted from the moving camera, so quick presses were lost (three Q presses 100 ms apart turned 15° instead of 45°). | Steps start from the running move's destination with a 240 ms ease-out; only flights keep the long ease-in-out. |
| 57 | Orbit moves interpolated the camera in a straight line: "face north" from 180° swooped over the target instead of turning around it. | Spherical interpolation around the moving target (`lib/world/orbit.ts`). |
| 58 | Pin heights froze on the first (8 m) level and were never refined, and the probe budget went to pins with nothing drawn below. | A pin is measured again whenever the tile drawn under it changes, in round-robin order. |
| 59 | Flights to places not drawn kept the previous target's height: the camera could end hundreds of metres underground (82 % of the municipality is not drawn from the home view). | `groundHeightAt`: the finest loaded tile, else the manifest's height range for that tile (about ±8 m), measured again at the end of the flight. |
| 60 | Under reduced motion, instant moves first glided toward the previous place's ground. | Every scripted move resets the ground probe; reduced motion snaps. |
| 61 | An outage of 14 s or more disabled the tiles asked for during it: holes, "Building Lausanne" forever, and the failure shown nowhere. | Retries after 2, 4, 8, 30 s, then every minute, at once when the browser is back online or on "Try again"; failures no longer hold back the first view; a notice says some blocks could not load. |
| 62 | A silent worker or a stalled download blocked streaming for good (no worker error handling, no time limits). | A download stops after 20 s without data (not after a total time: slow 2G downloads must finish); the main thread gives each load 30 s, extended by progress; broken workers are replaced; loads go to the least busy worker. |
| 63 | Lazy BVH builds stalled the main thread: one 40-pin height check over the home view took about 700 ms building 36 trees, 9 for meshes no ray crossed. | Bounding-box test first, nearest mesh first, and checks that can wait build about one tree per frame (200 pins: worst frame 39 ms instead of 450–570 ms stalls). |
| 64 | Eviction could drop tiles the view refines through, leaving holes and pops. | The refined path and its children stay; a root that is not loaded draws its loaded children (refined ancestors evicted: 4 → 0; hole frames on an instant zoom-out: 23 → 12). |
| 65 | The culling frustum lagged one frame while rotating. | The camera matrix is updated before it is built. |
| 66 | "Use map centre" picked the orbit target reported up to 250 ms earlier. | A ray is cast when the button is pressed. |
| 67 | Browsers with WebGL 1 only got "crashed, try again", but three.js 0.186 needs WebGL 2. | WebGL 2 is detected; those browsers get the no-WebGL card and the list. |
| 68 | The LOD walk allocated keys and boxes every frame. | Precomputed once per index: selection takes 0.075 ms instead of 0.33 ms at the home view. |
| 69 | Under reduced motion, water kept rippling and the controls kept their inertia. | Both stop. |
| 70 | Constant 3D motion (pins, location halo, trees, water) could only be stopped through the system setting (WCAG 2.2.2). | **Reduce motion** in the account menu: remembered in the browser, applied before the first paint, and it also calms the interface's CSS motion (the `motion-reduce` / `motion-safe` variants follow it). |
| 93 | The horizon was requested once: after a failed download the visit went on without lake, Jura and Alps, and a component unmounted before the tiles were ready kept polling. | Retried like the blocks (2, 4, 8, 30 s, then every minute) and at once when the browser is back online; the poll stops on unmount. |

### Edge cases

Driven with worst-case data (schema-limit names and URLs, emoji, empty
queues), offline and hanging networks, forced colours, 320 px, 200 % zoom
and short landscape screens.

| # | Finding | Consequence |
| --- | --- | --- |
| 71 | The city error card was still laid out in the bottom stack, its buttons off-screen, and "Try again" unmounted it, dropping focus. | Centred on the screen; it stays (with a spinner) during the retry, and focus moves to the map if the city comes back. |
| 72 | The report dialog kept the last reason and error: a review could be reported as "closed" while no option looked selected. | Every report starts afresh, and the reason is checked against the target ([test](../../apps/web/src/components/place/__tests__/ReportDialog.test.tsx), fails on the old dialog). |
| 73 | Offline, paused requests looked like empty results: "Nothing found" with spots on the map, "Be the first to review" under "5 reviews", "Adding…" forever, a vote shown but never stored. | Demo requests never pause (the data is local); changes fail at once with the offline message; the panel, reviews, search and moderation queues say they are waiting for the connection. |
| 74 | Long URLs and certifier names overflowed: the panel scrolled sideways, the moderation page was 684 px wide on a 320 px screen. | `overflow-wrap: anywhere` on member-written text; badges wrap. |
| 75 | In forced colours (Windows contrast themes) focus was invisible and selected options, filters and tabs looked unselected: both were box-shadows and backgrounds. | A system-colour focus outline; selections marked in `Highlight`; the radio dot in `CanvasText`. |
| 76 | A street search that never got an answer said "Searching…" forever. | 8 s limit, then "Street search is unavailable". |
| 77 | Short screens (landscape with the keyboard up, 200 % zoom): the add-spot fields shrank to 24 px between header and footer; the sign-in dialog was cut off without scrolling. | Under 30 rem of height the whole add-spot dialog scrolls; every dialog fits the viewport and scrolls. |
| 78 | Escape while writing a review closed the panel and lost the draft. | Escape inside a changed review leaves the panel open. |
| 79 | With a filter on, the list said "No spots here yet… add the first one" while 10 spots were in view. | "None of the spots in view match this filter" and a "Show all" button. |
| 80 | A 539 px name tag stayed on the map after choosing a row with the keyboard. | Cleared on choose; tags are capped (min(20 rem, 80 vw)) with an ellipsis. |
| 81 | An emoji-first display name gave a broken initial ("�F"). | Grapheme-aware initials (`Intl.Segmenter`), the user icon when no word starts with a letter. |
| 82 | On phones the search results were as narrow as the field ("Restaurant Li…"). | The results use the screen width. |
| 83 | Moderation tab panels took focus without showing it. | A focus ring. |
| 84 | When the clipboard is refused, sharing showed a bare URL that vanished before it could be selected. | An explanation, the link selectable, and the message stays until closed. |
| 85 | At 320 px radio labels crossed their card ("Restauration") and "Retour à la carte" wrapped inside a fixed-height pill. | Labels hyphenate and wrap; below 360 px the header shows the mark without the wordmark. |
| 86 | The browser's UI colour ignored the theme chosen in the menu. | Both `theme-color` tags follow it. |
| 87 | A double click on "Sign in" sent two requests (two emails with the real backend). | One request at a time. |
| 88 | A link to a removed spot said "This spot is no longer on the map" twice, under an empty tile; a mistyped id reached the database as an invalid UUID. | "Spot not found" as title, no tile; ids that are not UUIDs are "not found" before any request. |
| 89 | More than 6 cuisines were dropped without a word. | A field error; the collapsed "More details" section opens to show it. |
| 90 | The list showed "1284", the panel "1,284". | Locale formatting in both. |
| 91 | Moderation note fields were 14 px on phones, which makes iOS zoom on focus. | 16 px below the `md` breakpoint. |

### Dependencies

| # | Finding | Consequence |
| --- | --- | --- |
| 92 | Dependabot's grouped patch update (React and React DOM 19.3.0 → 19.3.1, pull request #6) passed the whole CI. | Applied on the branch with a clean install (a reused local store kept links to 19.3.0, so `node_modules` was rebuilt from the lockfile as CI does); Dependabot closes its pull request once the branch has the version. |

## Third pass: the owner's six requests

After the second delivery the owner asked for the towns around Lausanne,
real colours and a livelier pixel-art city, nicer markers, a real backend
on Vercel with the list of credentials it needs, a single `main` branch,
and a new interface ("aesthetic and alive while minimalistic", with the
Emil Kowalski and "Make Interfaces Feel Better" skills).

### Interface

| # | Finding | Consequence |
| --- | --- | --- |
| 94 | The interface read as bland: one humanist typeface everywhere, a cool lake-mist palette that matched nothing in the newly coloured city, flat cards, a spot panel made of equal-weight buttons, little feedback when something changed. | "Diorama" ([ADR 0023](../decisions/0023-diorama-design-system.md)): warm paper and ink, Geist with Geist Pixel accents, a pixel-art brand cube, islands, a dock, a trust card, action tiles, a rolling count with a one-shot ping, a capped stagger in the list. |
| 95 | A focus ring at 70 % of the lake blue measured 2.7:1 on white (3:1 needed). | Focus rings are solid (4.3:1 light, 7.2:1 dark); `scripts/check-contrast.py` measures every pair from the tokens. |
| 96 | NumberFlow draws hidden digit wheels, so the dock button's `aria-label` ("10 spots in view") no longer matched its visible text for axe (`label-content-name-mismatch`, WCAG 2.5.3); caught by the end-to-end axe scan. | The button is named by visually hidden text instead of `aria-label`. |
| 97 | A spot opened on a phone sat behind the bottom sheet, and behind the side panel on desktop. | While a panel is open the projection is shifted (`setViewOffset`) so the target is centred in the uncovered area ([rendering](../architecture/rendering.md#canvas-and-camera)). |
| 98 | A half-written review stayed open, with its text, when another spot was chosen: the review form kept its state across spots. | The spot details are keyed by spot (and cross-fade). |
| 99 | `next/font` has no fallback metrics for Geist Pixel; the build warns "Failed to find font override values". | No metric-adjusted fallback face for it (`adjustFontFallback: false`); while it loads, pixel labels use Geist Mono. Turbopack still prints the warning once per build: harmless. |
| 100 | The local development server streams the small Flon demo city, so a link to a spot outside it (Aldi, Route d'Oron) parks the camera at the demo's edge with "0 spots in view". Not a production issue (the full city covers every spot). | Noted for screenshots and manual tests: point `NEXT_PUBLIC_CITY_BASE_URL` at a locally built `lausanne` city. |

### Backend and repository

| # | Finding | Consequence |
| --- | --- | --- |
| 101 | Migrations were deployed by hand, so a merged migration could wait while the deployed app already needed it. | `database.yml` deploys on pushes to `main` that change migrations, after the pgTAP suite passes on a fresh database ([ADR 0024](../decisions/0024-continuous-backend-deployment.md)). |
| 102 | Supabase pauses free projects after about a week without requests. | A daily one-row public read (`keepalive.yml`). |
| 103 | Vercel's build image brings its own Bun, possibly older than the one that wrote `bun.lock` (lockfile version 2, Bun 1.4.2), which makes `--frozen-lockfile` fail. | `apps/web/vercel.json` installs with `npx bun@1.4.2` from the repository root. |
| 104 | The repository's default branch was the first working branch, `claude/brave-darwin-5h63h8`; `main` already contained all of its commits and the Dependabot branch's change (React 19.3.1). This session's git access cannot change the default branch or delete branches. | Everything is on `main`; switching the default branch and deleting the two other branches is a two-click step for the owner (in the delivery notes). |

### City: area, colours and look

| # | Finding | Consequence |
| --- | --- | --- |
| 105 | SWISSIMAGE is hazy at any resolution: the median per-roof CIELAB chroma is 3.8 at 0.4 m against 3.9 with 2 m sampling. But the finer, filtered pixels make the hue reliable (clay 40–75°, copper 160–205°, panels dark and bluish). | Roofs are classified by hue family, and lightness picks the shade ([ADR 0025](../decisions/0025-colour-model-from-open-data.md)). |
| 106 | Palette sRGB values were fed to the shader as linear, so everything rendered lighter and greyer than the palette: the main cause of the "bland" look. | The shader linearises the albedo; the lights were retuned. |
| 107 | Pitched roofs voxelise into staircases whose steps took the facade colour, so roofs looked striped. | Steps take a darker roof shade (at most 3 voxels, pitched triangles only). |
| 108 | swissBUILDINGS3D has no EGID in Vaud. | Building-register points are joined by footprint or within 3 m: 96.2 % of 36 037 buildings match. |
| 109 | Per-block colour sampling could give a building on a block edge two colours. | Colour inputs cover whole buildings on a 2 m world-anchored grid. |
| 110 | Baked occlusion with every neighbour cost 63 % more quads, and terrain steps cut hillsides into strips. | Restricted occlusion on levels 0–1 only: the Flon demo grows 21 % in quads and 25 % in bytes, colours included. |
| 111 | At the low pixel-art resolution, T-junction cracks show as sky-coloured pixels. | The frame pass fills pinholes (about 0.2 % of pixels). |
| 112 | Playwright's `page.clock` freezes `performance.now()` and stalls the frame loop. | `setSunTime` pins the light instead. |
| 113 | "Ecublens (VD)", "Renens (VD)" and "Saint-Sulpice (VD)" carry canton suffixes in swissBOUNDARIES3D. | Names match exactly, then without accents and suffix, within canton 22; ambiguous names fail the build. |
| 114 | The 10 cm SWISSIMAGE files have a 0.4 m overview readable by range requests (0.3–1 s per sheet, about 1.4 MB per km² cached). | Roofs use it; no 10 cm download. |
| 115 | OpenStreetMap farmland covers green, ripe and ploughed fields alike. | Each field takes its colour from its photo pixels. |
| 116 | Only 46 % of Lausanne roofs keep their colour family under the new rule, although the families' shares barely move (the old "brown" caught every pitched roof that was neither grey nor clearly red). | Distribution and flows in [materials](../pipeline/materials.md). |
| 117 | No halal-tagged OpenStreetMap place lies in the 15 neighbouring municipalities (extract of 2026-10-19). | The seed is unchanged at 11 places; new spots there come from the community. |
| 118 | On SwiftShader, desktop frames are 1.1–4.5× faster and the desktop first view 8–46 % sooner despite 21 % more quads; the phone's low preset is level. | [ADR 0026](../decisions/0026-pixel-art-rendering-and-real-sky.md); real devices still to be measured. |

### Markers and city life

| # | Finding | Consequence |
| --- | --- | --- |
| 119 | The old pins were meshes scaled in perspective (never under 3 m): they covered whole buildings up close and became blobs from afar. Badges placed by a vertex shader keep one size on screen, but three's raycaster cannot hit them. | Pixel badges ([ADR 0027](../decisions/0027-pixel-badges-in-screen-space.md)); the layout records each badge's rectangle on screen in drawing order and a pointer is tested front-most first, through the camera's projection (view offset included). |
| 120 | Pixel art scaled by a non-whole factor with nearest filtering gets uneven texels, and blurs with linear filtering; in a canvas drawn at a third of the resolution a texel cannot be smaller than one render pixel, so a 15-texel badge became 45 px. | "Sharp bilinear" sampling, whole render pixels per texel where pixels are large, and an 11-texel compact set when a full badge would pass 34 px: badges stay 22–37 px at every art pixel size and density (tested). |
| 121 | The selected spot's name tag was always empty, in production too. drei's `<Html>` appends to the canvas' parent until R3F connects its events, then moves to the event element; the move re-ran its layout effect, whose cleanup unmounted the old React root while React was committing (React 19 defers it), and the deferred unmount emptied the wrapper the new root had just rendered into. | Both name tags get a fixed `portal` from their first render, so they never move. |
| 122 | Boat routes drawn from a map crossed land: the Lavaux route clipped the shore east of Ouchy, the Évian line the tip of Ouchy's pier, the Vevey approach the quay. | A test decodes the shipped lake (horizon and level-3 tiles, meshopt) into a raster and checks that every hull, with 4 m to spare, stays over water all along every loop; the waypoints were moved until it passed. |
| 123 | Headings taken from the segments of a polyline snapped by up to 18°/s at the berths, and an open spline closed its loop with a kink. | Closed, periodic centripetal Catmull-Rom loops and headings measured over ±12 m of path: the sharpest turn is about 4°/s. |
| 124 | Life at true scale vanishes from the map's usual height: at 1.5 km a 9 m yacht is a 6 px sliver and a gull about one pixel. | Minimum sizes on screen: boats grow with distance (small boats up to 3.2×, ships up to 1.8×), birds are at least 13–16 px wide. |
| 125 | Finding the ground under each flock with a ray cast built tile BVHs (5–40 ms each) on the main thread. | Birds fly over the manifest's height estimate for the place (finest tile's `minY + 0.4 × (maxY − minY)`, water at 0): close enough 15–60 m up, no ray casts. |
| 126 | Laying out 1 000 badges every frame (projection, sort with a comparator, hit boxes) cost about 1 ms. | Layout only when the view or a marker changed, badges 80 px off screen skipped, a native sort of packed keys: 0.41 ms while the camera moves (the old pins: 0.43–0.48 ms), nearly nothing while it is still. |
| 127 | Under SwiftShader at 1 440 × 900 on a shared 4-core machine a frame takes 1.5–3 s and depends on the city's rasterisation and on the load of the machine, not on markers or life. | Script costs are measured JIT-warm in Node (the real R3F root with a stand-in renderer); GPU costs are judged by draw calls (badges 2, life about 7) and triangles. |
