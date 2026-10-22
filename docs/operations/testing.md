# Testing and CI

| Suite | Tool | Count | Command | Runs on |
| --- | --- | --- | --- | --- |
| Shared geo maths | Vitest | 10 | `bun run --cwd packages/geo-types test` | every push |
| Web units and components | Vitest + Testing Library (jsdom) | 193 (35 files) | `bun run --cwd apps/web test` | every push |
| End-to-end + accessibility | Playwright + axe | 38 (19 × desktop and Pixel 7; the keyboard-shortcut flow runs on desktop only) | `bun run test:e2e` (after `bun run build`) | every push |
| Geodata pipeline | pytest | 72 (one needs the downloaded municipal boundaries and is skipped without them) | `cd pipelines/geodata && pytest` | every push |
| Database | pgTAP | 85 assertions (4 files) | `bash scripts/test-db.sh` | every push |
| Types and lint | `next typegen && tsc`, ESLint (+ jsx-a11y, React Compiler rules) | – | `bun run typecheck`, `bun run lint` | every push |

`bun run test` at the root runs both Vitest suites.

## What is covered

**geo-types**: LV95 ↔ WGS84 against coordinates computed by PostGIS (forward
and inverse within 0.1 mm, round trips within 2 mm), tile maths (children,
parents, keys, world boxes).

**Web units**:

* `lod.test.ts`: roots first, parents kept until all children are ready, swap
  to children, coarse when far, hysteresis, frustum culling, loaded children
  drawn under a missing root;
* `tile-store.test.ts`: the retry schedule (2, 4, 8, 30 s, then every
  minute), retry on "back online", stalled loads and silent or broken
  workers replaced, least-busy dispatch, eviction keeping the refined path;
* `navigation.test.ts`, `picking.test.ts`, `orbit.test.ts`: the ground
  height fallback (loaded tile, manifest range, target), flights that wait
  for the manifest (a shared link resolves first) keeping only the latest,
  BVH build pacing,
  spherical interpolation around a moving target (the short way round);
* `motion-preference.test.ts`: Reduce motion is off by default, overrides the
  system setting and is remembered;
* `CameraRig.test.tsx` and `CityTiles.test.tsx` (a real R3F root): controls
  survive a re-render mid-drag, quick steps add up and turn around the
  target, reduced motion is instant and without inertia, the frustum is
  current, failed blocks neither hold back the first view nor stay failed
  once the network is back, the water holds still under reduced motion;
* `tile-format.test.ts`: decodes a real gzip + meshopt tile from the pipeline;
* `geocoder.test.ts`: label parsing (addresses, gazetteer kinds,
  municipalities), HTML entities, the x/y axis swap, deduplication, no request
  for one letter, reverse geocoding (nearest entrance, nothing nearby), the
  8 s limit on an unanswered search and cancellation by the caller;
* `demo-repository.test.ts`: the demo backend's rules (seed data and sign-in
  required to write, pseudonyms, validation and duplicates, removal and
  moderator restore, vote changes, review confirmations, moderator-only API,
  persistence);
* `VoteControl.test.tsx`: a named group of two toggles, sign-in then the vote
  resumes, changing and withdrawing, disabled on your own spot;
* `ChoiceCards.test.tsx`: the legend names the group and each card names its
  radio; pointer and arrow-key selection;
* `safe-next.test.ts`: the open-redirect guard of the sign-in callback
  (including tab and newline tricks);
* `sign-in-methods.test.ts`: `NEXT_PUBLIC_AUTH_PROVIDERS` read as sign-in
  methods: unset means e-mail only, a list of providers leaves e-mail out,
  spacing, case and repeats are ignored, and a list with nothing usable
  falls back to e-mail so sign-in never disappears;
* `AuthDialog.test.tsx`: with OAuth only (no SMTP server) the dialog shows
  just the provider buttons and their errors, with no e-mail form or "or"
  divider; with both, the e-mail form follows the providers;
* `ReportDialog.test.tsx`: every report starts afresh (no reason or error
  carried over between a spot and a review);
* `SubmitPlaceDialog.test.tsx`: too many cuisines are a field error, shown
  even when "More details" was collapsed, and nothing is sent until fixed;
* `ModerationConsole.test.tsx`: a deleted review stays readable in its
  report, and its author can be suspended and reinstated after confirmation;
* `initials.test.ts`: avatar initials keep accents and emoji whole and skip
  words that do not start with a letter;
* `messages.test.ts`: French and English have the same keys, placeholders and
  rich-text tags;
* `use-view-announcer.test.tsx`: compass names, one announcement once a
  keyboard move settles (not held back by the camera's periodic reports, and
  after the spots around the new centre load), silence for pointer gestures
  and for flights that announce themselves;
* `BottomBar.test.tsx`: the dock's list button is named by its count from
  text, not `aria-label` (NumberFlow draws hidden digits; WCAG 2.5.3), says
  when no spot is in view and steps aside while a location is picked;
* `Attribution.test.tsx`: the "Demo city" chip appears with the demo city
  that ships with the code and not with the agglomeration; the credits are
  always there;
* `MapHint.test.tsx`: the first-visit tip waits for the city, shows once per
  browser, uses touch wording on touch screens, is hidden from assistive
  technology, leaves at the first key and stays away from an open spot;
* `config.test.ts`: the pixel-art presets cover a whole number of device
  pixels per rendered pixel on usual and odd screens and use finer pixels
  on narrow screens; pixels keep their close-up size near the city and in
  the home view on every screen, shrink (never grow) to the far size as the
  camera pulls back, change only past a quarter-pixel margin (zooming out
  and back passes through the same few resolutions), and only the far size
  of medium and high is antialiased, never the canvas; the fog is unchanged
  around the home view and starts beyond the point the camera looks at
  from 9 km;
* `materials.test.ts`: class, variant and occlusion unpacked from the alpha
  byte as the pipeline packs it, format 1 tiles read unchanged, one program
  per level of detail;
* `sun.test.ts`: the solar position (culmination on the solstices, due south
  at solar noon, sunrise and sunset azimuths), the evening and morning light
  outside daylight, the night cross-fade and autumn only in autumn;
* `marker-atlas.test.ts`, `marker-screen.test.ts`, `PlaceMarkers.test.tsx`
  (a real R3F root): every badge packed without overlap in premultiplied
  colours, one glyph per category, the states; projection identical to
  three's, the view offset followed, badges 22–38 CSS px at every art pixel
  size and density, crisp on coarse pixels; clicks and taps select the
  front-most badge, drags, empty ground and markers behind the camera are
  ignored, hover follows badges moving under a still mouse;
* `Life.test.tsx`, `boats.test.ts`, `paths.test.ts`, `birds-clouds.test.ts`:
  a handful of instanced draw calls, only the big boats on low, everything
  still under reduced motion; boats start and stop gently, moor for their
  dwell, run the Évian line both ways and keep every hull over water along
  every loop (the shipped lake tiles are decoded for this; water is the
  water shader class, shallow water included); smooth loops
  without kinks; flocks stay around their place and lean into turns, gulls
  glide; clouds drift and never veil the city.

**End-to-end** (`apps/web/e2e`, demo backend, committed Flon tiles, swisstopo
API mocked for determinism, every scenario on desktop 1440 × 900 and Pixel 7):

* map page renders with its landmarks and controls, axe clean;
* skip link → map → keyboard shortcuts (the move is announced) → search
  (desktop);
* the spots list opens a spot (dialog named after it, URL updated), axe clean;
* deep links `?spot=` open the spot; a link to a spot that is gone says
  "Spot not found" once;
* Reduce motion (account menu) is remembered across a reload and applied
  before the first paint;
* search finds a community spot and swisstopo places, and asks for more than
  one letter;
* add a spot: sign-in interrupts and resumes the action, placement with "Use
  map centre", reverse-geocoded address, validation message, success, own
  spot cannot be upvoted; axe on the sign-in dialog and the form;
* vote and review: upvote after sign-in, review with rating, text and a
  halal confirmation; keyboard focus expands the phone sheet; Escape (on
  Android, the close watcher) keeps an unsent review and says why;
* about, privacy and terms pages (FR/EN) axe clean; un-prefixed URLs redirect;
  localized 404; language switch keeps the page; moderation needs a moderator;
  moderators see the console.

**pytest**: grid maths and plan completeness, meshing invariants,
voxelisation (exact volumes, pitched roofs, WKB parsing), OSM tag mapping,
roof colours, open-lake detection; the agglomeration's municipalities
(official names, names without canton suffix or accents, unknown and
ambiguous names fail, boxes cover the buffered land, the real boundaries
resolve when downloaded); the building register (era from the construction
year, footprint joins); land cover (fields coloured from the photo, outdoor
pools, lake tint by distance, patchy forests); the horizon's lake shaded
with the tiles' thresholds (shallow, open, deep) and a cache key that
changes with the horizon; roof sampling (shadows and
overhanging trees ignored, solar panels counted, taller roofs win where
roofs overlap, whole buildings on the world grid).

**pgTAP**: see [data model](../backend/data-model.md#tests).

## CI (`.github/workflows/ci.yml`)

Three jobs on Ubuntu 24.04, cancelled when a newer push arrives on the same
branch:

1. **web**: Bun 1.4.2, frozen install, typecheck, lint, unit tests, production
   build, Playwright's Chromium, end-to-end tests (one worker, one retry);
   the HTML report is uploaded when something fails.
2. **pipeline**: Python 3.13, pinned requirements, pytest.
3. **database**: PostgreSQL 16 + PostGIS 3 + pgTAP from Ubuntu packages, all
   migrations on a fresh database (with a shim for Supabase's `auth` schema
   and roles), then `pg_prove`.

### Lessons from the first CI runs

* **The runner connects as its own superuser**, not `postgres`. The profile
  guard only exempted named roles and refused the test setup; it now exempts
  any superuser (they bypass row-level security anyway), which is what a
  local developer's own superuser needs too.
* **WebGL on two CPU cores.** Private repositories get 2-core runners, and
  the city renders with SwiftShader on the CPU. Rendering every frame starved
  the page: closing the sign-in dialog alone could take more than 15 s, the
  add-a-spot scenario ran out of its 90 s budget, and two browsers in
  parallel even missed the 60 s first-view wait. Fixes: the city renders only
  on demand while a modal covers it and until the modal's exit transition is
  over (also a battery win on phones); CI runs **one browser at a time**
  (Playwright's own recommendation for CI); the two long dialog flows are
  `test.slow()`. Verified by pinning the whole run to two cores
  (`CI=true taskset -c 0,1 bun run test:e2e`): before, 1 failed and 1 flaky
  test; after, 33 passed and 1 skipped (by design) with no retries, in 8.3
  minutes.

* **Typing before hydration.** One test typed into the search box right after
  navigation. On a busy CPU, React had not hydrated yet: the letter stayed in
  the DOM but never reached the component's state (1 failure in 20 runs on
  two cores). Tests now wait until the page is interactive
  (`waitForInteractive`: the client-only canvas is mounted) before typing;
  20 of 20 runs pass. For people the effect is small: a letter typed before
  hydration shows suggestions from the next keystroke.

## Running end-to-end tests locally

```bash
bun run build                       # demo mode, Flon tiles (no .env.local needed)
bun run test:e2e                    # starts `next start` on port 3100
PW_CHROMIUM_PATH=/path/to/chrome bun run test:e2e   # use an existing Chromium
```

Playwright launches Chromium with SwiftShader flags so the city renders
without a GPU. `E2E_PORT` changes the port. Failed runs keep traces
(`npx playwright show-trace test-results/…/trace.zip`).

## Manual checks before a release

Automated tools catch perhaps a third of accessibility problems. Before a
public launch or a large UI change:

* keyboard only: every flow (search, open a spot, vote, review, report, add a
  spot, sign in, moderation) without a mouse; focus always visible;
* screen readers: VoiceOver (iOS Safari, macOS Safari), NVDA (Windows
  Firefox/Chrome), TalkBack (Android Chrome); the spots list and spot panel
  are the main path;
* zoom to 200 % and 400 % (reflow), large text settings on phones;
* reduced motion and reduced transparency settings;
* real phones on mobile data: first view time, frame rate while panning,
  battery drain over 10 minutes ([performance](performance.md)).
