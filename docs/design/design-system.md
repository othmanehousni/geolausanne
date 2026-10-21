# Design system: "Diorama"

The voxel city is the hero: a colourful pixel diorama of Lausanne. The
interface is a quiet, precise layer of islands over it, in warm paper and
ink neutrals, so it frames the city instead of competing with it. **Saffron
is the one accent**, reserved for halal spots and the action that adds them;
a lake blue marks focus and verified facts; a pixel typeface and a pixel
cube carry the voxel theme into the interface in small doses. Tokens live in
[`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css)
(Tailwind v4 `@theme`, shadcn variable names), components in
[`components/ui`](../../apps/web/src/components/ui) (shadcn "base-nova" on
Base UI). Guidance applied throughout: the owner's "Make Interfaces Feel
Better" and Emil Kowalski design-engineering skills. It replaced the first
system ("Lac & Molasse") in October 2026, when the owner found the interface
bland; see [ADR 0023](../decisions/0023-diorama-design-system.md).

## Colour

All colours are OKLCH. Light theme first, dark theme in `.dark` (also the 3D
night mode).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `oklch(0.975 0.005 85)` paper | `oklch(0.165 0.008 265)` | page |
| `foreground` / `primary` | `oklch(0.205 0.012 265)` ink | `oklch(0.965 0.004 85)` | text, primary buttons, the Directions tile |
| `card`, `popover` | white | `oklch(0.205 0.009 265)` | panels, dialogs, the raised vote pill |
| `muted-foreground` | `oklch(0.48 0.012 265)` | `oklch(0.73 0.01 265)` | secondary text |
| `border` / `input` | ink at 9 % / 50 % | white at 9 % / 38 % | hairlines / field and choice outlines (3:1 needed) |
| `ring` | `oklch(0.58 0.17 255)` | `oklch(0.72 0.14 255)` | focus rings, always solid |
| `saffron` (+ `-foreground`) | `oklch(0.8 0.155 72)` | `oklch(0.82 0.145 74)` | spots, "Add a halal spot", the brand cube's top |
| `leman` | `oklch(0.52 0.15 255)` | `oklch(0.74 0.12 250)` | verified facts, "halal checked" seals |
| `upvote` / `downvote` | `oklch(0.55 0.14 155)` / `oklch(0.55 0.19 22)` | `oklch(0.75 0.14 155)` / `oklch(0.71 0.16 22)` | vote states (a pressed vote is filled) |
| `destructive` | `oklch(0.53 0.2 25)` | `oklch(0.69 0.17 22)` | errors, delete |
| `rating` | `oklch(0.64 0.15 65)` | saffron | stars (saffron is too light on white) |
| `glass` | white at 86 % | card at 86 % | islands over the city |

Surfaces inside panels are tints of the ink, not new colours: `foreground`
at 3.5–6 % for grouped lists, the trust card and soft tiles, at 7 % for
hairlines. They work on any surface and in both themes.

**Contrast** (WCAG 2.x, computed from the tokens by
[`scripts/check-contrast.py`](../../scripts/check-contrast.py); run it after
changing a colour):

| Pair | Light | Dark |
| --- | --- | --- |
| foreground on background / card | 16.7 / 17.9 | 17.4 / 16.2 |
| muted-foreground on background / card / tinted card (4.5 %) | 6.1 / 6.5 / 6.0 | 8.1 / 7.5 / 6.7 |
| saffron-foreground on saffron | 9.1 | 10.0 |
| primary-foreground on primary (buttons, Directions tile) | 17.2 | 16.4 |
| upvote / downvote / destructive / leman on card | 4.52 / 5.36 / 5.86 / 5.56 | 8.53 / 6.48 / 5.98 / 7.81 |
| **non-text (needs 3:1)**: page colour on a pressed upvote / downvote | 4.21 / 4.98 | 9.17 / 6.97 |
| focus ring on card / background | 4.33 / 4.03 | 7.21 / 7.76 |
| field and choice outlines (`input`) on card | 3.41 | 3.57 |
| filled / empty stars on card | 3.49 / 3.41 | 10.1 / 4.87 |

State is never conveyed by colour alone: votes also change icon weight
(bold outline → filled) and `aria-pressed`; selected choice cards show a
filled dot and a doubled border; certification has an icon and a label.

## Typography

Three cuts of one family (Vercel's Geist, SIL OFL), self-hosted through
`next/font` ([`app/fonts.ts`](../../apps/web/src/app/fonts.ts)):

* **Geist** for everything people read: crisp, neutral, wide apertures, made
  for interfaces. Titles 19 px semibold with −1.5 % tracking; body 14 px;
  meta 12–13 px.
* **Geist Pixel** for the voxel accents only: the wordmark, the counts and
  scores (dock, vote pill, spot rows, review avatars) and the "404". Never
  for sentences: pixel type is a texture, not a reading face. Its zero is
  slashed (`1Ø`), which is the font's only zero and reads as a pixel
  hallmark.
* **Geist Mono** for opening hours and keyboard keys.

Rules: inputs are 16 px on phones (no iOS zoom on focus), 14 px from `md`;
numbers that change use `tabular-nums`; headings `text-wrap: balance`,
paragraphs `pretty`.

## Shape, depth and surfaces

* Radii: islands and pills are full pills; panels and dialogs 28 px; cards
  inside them 18–22 px; tiles 15–16 px; list rows 18 px around 13 px icon
  tiles. Corners are concentric: an inner radius is the outer one minus the
  padding (the vote pill's buttons inside its 6 px padding, the review form's
  pill buttons inside its 22 px card).
* Buttons are pills by default (the `Button` primitive's base radius).
* Depth is a **shadow used as a border** (Make Interfaces Feel Better): a
  1 px ink ring at 6 %, a short lift and a long ambient falloff.
  `--shadow-float` for islands, pills, menus and popovers; `--shadow-raised`
  for panels, dialogs and sheets. Dark mode swaps the ink ring for a faint
  white one, because ink shadows vanish on the night scene.
* **`.glass`** (`backdrop-filter: blur(20px) saturate(1.6)` over 86 %
  white): the top bar islands, the toolbar, the dock, the hint chip.
  Nearly opaque, so text contrast holds on any part of the city; a solid
  fallback when `backdrop-filter` is unsupported or the user asks for less
  transparency.
* Panels themselves (spot details, spots list, dialogs) are solid `popover`
  surfaces: long text reads best on an opaque background.

## The brand mark

One voxel drawn as 16 × 15 pixel art (a 2:1 isometric cube): saffron top,
lake-blue sides, one highlight pixel row. The rows live in
[`brand-pixels.ts`](../../apps/web/src/components/brand/brand-pixels.ts)
and feed the UI mark (CSS colours, theme aware), the generated icons and
the social image (sRGB hex for `next/og`) and the static favicon, so all of
them stay identical. Drawn with `shape-rendering: crispEdges`.

## Motion

Principles (Emil Kowalski): motion explains a change, is quick, uses strong
custom curves, and respects the user's preference; frequent actions are not
animated for show.

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entrances, hovers |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | moves on screen, the 404 cube |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | sheets and dialogs |
| `--animate-vote-pop` | 420 ms `cubic-bezier(0.34, 1.6, 0.5, 1)` | upvote icon pop |
| `--animate-vote-shake` | 380 ms ease-out | downvote icon shake |
| `--animate-dot-ping` | 700 ms, once | the dock's dot pings when the count of spots in view changes |
| `--animate-bob` | 3.2 s, loops | the lost cube on the not-found pages |

* UI transitions last 120–300 ms and name the properties they animate.
* Exits are faster than entrances: tooltips 125/90 ms, menus and popovers
  150/100 ms, dialogs 200/150 ms.
* Pressables scale to 0.94–0.97 on `:active` (never below 0.94).
* Tooltips, menus and popovers scale from 97 % at their trigger
  (origin-aware).
* "Alive" without noise: the count in the dock rolls (NumberFlow) and its
  dot pings once per change; the score rolls in the vote direction; the
  spots list's rows rise in with a 22 ms stagger (capped at ten rows) when
  the list opens; switching spots cross-fades the panel content (200 ms);
  the sign-in "check your email" icon zooms in once. Nothing loops except
  the 404 cube.
* **Reduced motion** (system setting or the account menu's "Reduce motion"):
  keyframe entrances and the stagger become instant; drawers, sheets and
  toasts fade in place; the camera jumps instead of flying; markers, trees
  and the lake stop moving. Short opacity and colour transitions stay,
  because they explain state changes.

## Icons

Phosphor (`@phosphor-icons/react`). **Bold** in buttons, chips and tiles,
regular in body text; **fill** for pressed votes, the verified shield, the
Directions arrow and the review "halal checked" seal; duotone for category
tiles. Each trust icon has one meaning everywhere: filled **shield** =
certificate checked by a moderator; **certificate** = certification
claimed by the spot; **seal check** = a member checked the halal status;
**gavel** = moderation. Decorative icons are `aria-hidden`; icon-only
buttons have an accessible name and a tooltip.

## Layout

```
┌──────────────────────────────────────────────────────┐
│ (■ GeoLausanne)  ( 🔍 Search spots, streets…   Ctrl K )  (◉) │  three islands
│                                                   ( + )  │
│ ┌──────────────┐                                  ( − )  │  toolbar island:
│ │ spot panel   │           3D city                ( ➤ )  │  zoom, compass,
│ │ or list      │                                  ( ⟲ )  │  rotate, home,
│ │ (side panel; │                                  ( ⌂ )  │  locate
│ │ phone: sheet)│     ( ✋ Drag to look around… )    ( ◎ )  │  first-visit hint
│ └──────────────┘   ( • 10 spots in view | + Add a halal spot ) │  the dock
│                     © swisstopo · © OpenStreetMap · About  DEMO │
└──────────────────────────────────────────────────────┘
```

* The **dock** is one island with the two main actions: browse the spots in
  view (count in pixel numerals) and add one (saffron).
* **Spot panel**: header (category tile, name, category · street, close),
  halal chips, the **trust card** (raised vote pill + confirmations, last
  confirmation, vote counts), the rules in small print, three **action
  tiles** (Directions in ink, Copy link, Report), a grouped info list,
  description, reviews with avatars, provenance. Desktop: a non-modal side
  panel; phones: a bottom sheet with a 19 rem peek and full height, and
  keyboard focus entering its hidden part expands it.
* **First-visit hint**: a glass chip above the dock, once per browser, gone
  at the first touch, scroll or key (or after nine seconds); hidden from
  assistive technology, which gets the full help in the map's description.
* Safe-area insets on all four sides; touch targets at least 24 px
  everywhere (WCAG 2.5.8) and 44 px on touch screens for the main controls
  (`pointer-coarse:` sizes or a pseudo-element extending the hit area).
* Short landscape screens keep only the compass and place tools in the
  toolbar; when a side panel is open between 48 and 80 rem wide, the dock
  moves right so the panel does not cover it.

## Writing

Short, concrete, friendly, in both languages. Halal vocabulary is precise:
*halal level* (all / some dishes / not stated), *certification claim*
(certified / self-declared / community) and *verified* (a moderator checked
the certificate) are never mixed up, and votes are described as community
trust, not certification. A short visible label is always the start of the
accessible name ("Report" for "Report a problem", WCAG 2.5.3).
