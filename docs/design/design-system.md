# Design system: "Lac & Molasse"

The voxel city is the hero. The interface is a quiet layer of frosted panels
in lake-mist neutrals with lake-ink text, so it never competes with the 3D
view. **Saffron is reserved** for halal spots and the one primary action that
creates them. Tokens live in
[`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css)
(Tailwind v4 `@theme`, shadcn variable names), components in
[`components/ui`](../../apps/web/src/components/ui) (shadcn "base-nova" on
Base UI). Guidance applied throughout: the owner's "Make Interface Better"
and Emil Kowalski design-engineering skills.

## Colour

All colours are OKLCH. Light theme first, dark theme in `.dark` (also the 3D
night mode).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `oklch(0.977 0.004 240)` lake mist | `oklch(0.18 0.025 255)` | page |
| `foreground` / `primary` | `oklch(0.24 0.03 245)` lake ink | `oklch(0.96 0.006 240)` | text, primary buttons |
| `card`, `popover` | `oklch(0.995 0.002 240)` | `oklch(0.22 0.027 255)` | panels, dialogs |
| `muted-foreground` | `oklch(0.47 0.025 245)` | `oklch(0.74 0.02 245)` | secondary text |
| `border` / `input` | ink at 11 % / 16 % | white at 10 % / 15 % | hairlines, fields |
| `ring` | `oklch(0.56 0.12 245)` | `oklch(0.7 0.11 245)` | focus rings |
| `saffron` (+ `-foreground`) | `oklch(0.79 0.15 70)` | `oklch(0.82 0.14 72)` | spots, "Add spot" |
| `leman` | `oklch(0.52 0.12 245)` | `oklch(0.72 0.11 245)` | links, lake accents |
| `upvote` / `downvote` | `oklch(0.55 0.13 155)` / `oklch(0.56 0.18 12)` | `oklch(0.74 0.14 155)` / `oklch(0.7 0.16 15)` | vote states |
| `destructive` | `oklch(0.56 0.19 12)` | `oklch(0.68 0.17 15)` | errors, delete |
| `glass` | card at 84 % | card at 80 % | frosted panels over the city |

**Contrast** (WCAG 2.x, computed from the tokens):

| Pair | Light | Dark |
| --- | --- | --- |
| foreground on background / card | 15.4 / 16.2 | 16.8 / 15.4 |
| muted-foreground on background / card / muted | 6.4 / 6.7 / 5.9 | 8.2 / 7.5 / 6.3 |
| saffron-foreground on saffron | 8.6 | 10.0 |
| upvote / downvote / destructive / leman on card | 4.50 / 5.05 / 5.08 / 5.38 | 7.95 / 6.01 / 5.54 / 7.05 |
| focus ring against background (needs 3:1) | 4.3 | 7.1 |

State is never conveyed by colour alone: votes also change icon weight
(outline → filled) and `aria-pressed`; selected choice cards show a filled
dot and a stronger border; certification has an icon and a label.

## Typography

* **Atkinson Hyperlegible Next** (Braille Institute; designed for low-vision
  readers, distinct letterforms such as `I l 1`) for everything; self-hosted
  through `next/font`.
* **Pixelify Sans** only for the wordmark, a nod to the voxels.
* Inputs are 16 px on phones (no iOS zoom on focus), 14 px from `md`.
* Numbers that change (scores, counts) use `tabular-nums`; headings use
  `text-wrap: balance`, paragraphs `pretty`.

## Shape, depth and surfaces

* Radius scale from `--radius: 0.75rem` (sm 0.6×, md 0.8×, lg 1×, xl 1.4×,
  2xl 1.8×, 3xl 2.2×, 4xl 2.6×); floating panels use 2xl–3xl, buttons are
  full pills or xl.
* Two shadows tinted with the ink colour: `--shadow-float` (toolbars, pills)
  and `--shadow-raised` (dialogs, sheets).
* **`.glass`**: `backdrop-filter: blur(14px) saturate(1.4)` over the city,
  with a solid card fallback when `backdrop-filter` is unsupported and when
  the user asks for reduced transparency. Blurred surfaces are kept small
  because the browser re-composites them every frame the canvas changes.

## Motion

Principles (Emil Kowalski): motion explains a change, is quick, uses strong
custom curves, and respects the user's preference.

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entrances, hovers |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | moves on screen |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | sheets and dialogs |
| `--animate-vote-pop` | 420 ms `cubic-bezier(0.34, 1.6, 0.5, 1)` | upvote icon pop (scale 1.3, −10°) |
| `--animate-vote-shake` | 380 ms ease-out | downvote icon shake |

* UI transitions last 150–300 ms; only the properties that change are
  transitioned (never `transition: all`).
* Pressable elements scale to 0.96–0.98 on `:active`, never below 0.95.
* Popovers and menus scale from their trigger (Base UI's transform-origin
  variables); dialogs fade in from 0.97 scale on desktop and rise as sheets
  on phones; drawers slide.
* Scores roll digit by digit in the vote direction (NumberFlow `trend`).
* Spinners appear only after a short delay, so fast responses do not flash.
* **Reduced motion**: keyframe entrances become instant, transform
  transitions are disabled with `motion-reduce:` variants, the camera jumps
  instead of flying, markers stop bobbing and trees stop swaying. Short
  opacity and colour transitions stay, because they explain state changes.

## Icons

Phosphor (`@phosphor-icons/react`), regular weight by default, bold in small
buttons, **fill** for pressed states (votes). Decorative icons are
`aria-hidden`; icon-only buttons have an accessible name and a tooltip.

## Layout

```
┌───────────────────────────────────────────────┐
│ [■ GeoLausanne]   [ Search spots, streets ⌘K ] [≡]│  top bar (safe-area aware)
│                                            [+] │
│  side panel (desktop)        3D city       [−] │  toolbar: zoom, compass,
│  or bottom sheet (phone)                   [⟲] │  rotate, home, locate,
│                                            [⌂] │  day/night
│                                            [◎] │
│ [ 12 spots · list ]            [ + Add spot ]  │  bottom bar
│ © swisstopo · © OpenStreetMap  (attribution)   │
└───────────────────────────────────────────────┘
```

* Desktop: spot details in a non-modal **side panel** on the left; the map
  stays interactive.
* Phones: a **bottom sheet** with two snap points (19 rem peek, full height);
  keyboard focus entering its hidden part expands it.
* Safe-area insets on the top bar, bottom bar and sheets; touch targets are
  at least 36 px (WCAG 2.2 asks for 24 px) and 40–44 px for primary controls;
  `-webkit-tap-highlight-color: transparent`, with visible `:focus-visible`
  rings instead.

## Writing

Short, concrete, friendly, in both languages. Halal vocabulary is precise: *halal level* (all / some dishes / not stated),
*certification claim* (certified / self-declared / community) and *verified*
(a moderator checked the certificate) are never mixed up, and votes are
described as community trust, not certification.
