# Testing and CI

| Suite | Tool | Count | Command | Runs on |
| --- | --- | --- | --- | --- |
| Shared geo maths | Vitest | 9 | `bun run --cwd packages/geo-types test` | every push |
| Web units and components | Vitest + Testing Library (jsdom) | 36 | `bun run --cwd apps/web test` | every push |
| End-to-end + accessibility | Playwright + axe | 34 (17 × desktop and Pixel 7) | `bun run test:e2e` (after `bun run build`) | every push |
| Geodata pipeline | pytest | 28 | `cd pipelines/geodata && pytest` | every push |
| Database | pgTAP | 59 assertions | `bash scripts/test-db.sh` | every push |
| Types and lint | `next typegen && tsc`, ESLint (+ jsx-a11y, React Compiler rules) | – | `bun run typecheck`, `bun run lint` | every push |

`bun run test` at the root runs both Vitest suites.

## What is covered

**geo-types**: LV95 ↔ WGS84 against coordinates computed by PostGIS (forward
and inverse within 0.1 mm, round trips within 2 mm), tile maths (children,
parents, keys, world boxes).

**Web units**:

* `lod.test.ts`: roots first, parents kept until all children are ready, swap
  to children, coarse when far, hysteresis, frustum culling;
* `tile-format.test.ts`: decodes a real gzip + meshopt tile from the pipeline;
* `geocoder.test.ts`: label parsing (addresses, gazetteer kinds,
  municipalities), HTML entities, the x/y axis swap, deduplication, no request
  for one letter, reverse geocoding (nearest entrance, nothing nearby);
* `demo-repository.test.ts`: the demo backend's rules (seed data and sign-in
  required to write, pseudonyms, validation and duplicates, removal and
  moderator restore, vote changes, review confirmations, moderator-only API,
  persistence);
* `VoteControl.test.tsx`: a named group of two toggles, sign-in then the vote
  resumes, changing and withdrawing, disabled on your own spot;
* `ChoiceCards.test.tsx`: the legend names the group and each card names its
  radio; pointer and arrow-key selection;
* `safe-next.test.ts`: the open-redirect guard of the sign-in callback;
* `messages.test.ts`: French and English have the same keys, placeholders and
  rich-text tags.

**End-to-end** (`apps/web/e2e`, demo backend, committed Flon tiles, swisstopo
API mocked for determinism, every scenario on desktop 1440 × 900 and Pixel 7):

* map page renders with its landmarks and controls, axe clean;
* skip link → map → keyboard shortcuts → search (desktop);
* the spots list opens a spot (dialog named after it, URL updated), axe clean;
* deep links `?spot=` open the spot;
* search finds a community spot and swisstopo places, and asks for more than
  one letter;
* add a spot: sign-in interrupts and resumes the action, placement with "Use
  map centre", reverse-geocoded address, validation message, success, own
  spot cannot be upvoted; axe on the sign-in dialog and the form;
* vote and review: upvote after sign-in, review with rating, text and a
  halal confirmation; keyboard focus expands the phone sheet;
* about, privacy and terms pages (FR/EN) axe clean; un-prefixed URLs redirect;
  localized 404; language switch keeps the page; moderation needs a moderator;
  moderators see the console.

**pytest**: grid maths and plan completeness, meshing invariants,
voxelisation (exact volumes, pitched roofs, WKB parsing), OSM tag mapping,
roof colours, open-lake detection.

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
