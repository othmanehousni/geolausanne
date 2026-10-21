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
| `border` / `input` | ink at 11 % / 52 % | white at 10 % / 38 % | hairlines / field and choice outlines (3:1 needed) |
| `ring` | `oklch(0.56 0.12 245)` | `oklch(0.7 0.11 245)` | focus rings |
| `saffron` (+ `-foreground`) | `oklch(0.79 0.15 70)` | `oklch(0.82 0.14 72)` | spots, "Add spot" |
| `leman` | `oklch(0.52 0.12 245)` | `oklch(0.72 0.11 245)` | links, lake accents |
| `upvote` / `downvote` | `oklch(0.55 0.13 155)` / `oklch(0.56 0.18 12)` | `oklch(0.74 0.14 155)` / `oklch(0.7 0.16 15)` | vote states |
| `destructive` | `oklch(0.5 0.19 12)` | `oklch(0.68 0.17 15)` | errors, delete |
| `rating` | `oklch(0.64 0.15 65)` | saffron | stars (saffron is too light on white) |
| `glass` | card at 84 % | card at 80 % | frosted panels over the city |

**Contrast** (WCAG 2.x, computed from the tokens):

| Pair | Light | Dark |
| --- | --- | --- |
| foreground on background / card | 15.4 / 16.2 | 16.8 / 15.4 |
| muted-foreground on background / card / muted | 6.4 / 6.7 / 5.9 | 8.2 / 7.5 / 6.3 |
| saffron-foreground on saffron | 8.6 | 10.0 |
| upvote / downvote / destructive / leman on card | 4.50 / 5.05 / 6.57 / 5.38 | 7.95 / 6.01 / 5.54 / 7.05 |
| destructive button text on its tint | 5.53 | 4.79 |
| account initials on leman | 5.23 | 7.37 |
| **non-text (needs 3:1)**: focus ring (80 %) on panels | 3.22 | 4.66 |
| field and choice outlines (`input`) | 3.42 | 3.55 |
| filled / empty stars on panels | 3.44 / 3.23 | 9.71 / 4.75 |

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
* Two shadows tinted with the ink colour: `--shadow-float` (toolbars, pills,
  menus, popovers) and `--shadow-raised` (dialogs, sheets, toasts). Ink
  shadows vanish on the night scene, so dark mode redefines both as a faint
  white ring plus a black shadow.
* Corners are concentric: a container's radius is its content's radius plus
  its padding (e.g. the review form, `2rem` around `rounded-xl` buttons).
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
  transitioned (never `transition: all`; keyframe overlays set
  `animation-duration-*`, because Tailwind's `duration-*` also sets a
  transition duration on every property).
* Exits are faster than entrances: dialogs 200/150 ms, the add-spot dialog
  300/200 ms, toasts 400/200 ms; a flicked drawer scales its exit by the
  swipe speed.
* Pressable elements scale to 0.96–0.98 on `:active`, never below 0.95.
* Popovers and menus scale from their trigger (Base UI's transform-origin
  variables) on the strong ease-out curve; when Base UI marks an opening as
  instant (moving between adjacent tooltips, a menu opened with the
  keyboard) there is no animation. Dialogs fade in from 0.97 scale and rise
  1 rem on phones; drawers slide.
* Tailwind's `translate-*` and `scale-*` utilities set the `translate` and
  `scale` properties, not `transform`: transitions name those properties
  (`transition-[translate,scale,opacity]`). The add-spot dialog animated
  `transform` and so jumped when it closed (found in the second pass).
* Scores roll digit by digit in the vote direction (NumberFlow `trend`).
* Spinners appear only after a short delay, so fast responses do not flash.
* **Reduced motion**: keyframe entrances become instant; drawers, sheets,
  toasts and the add-spot dialog fade in place instead of moving (the phone
  sheet keeps its peek height); the camera jumps instead of flying, map
  inertia stops, markers stop bobbing, trees stop swaying and the lake stops
  rippling. Short opacity and colour transitions stay, because they explain
  state changes.

## Icons

Phosphor (`@phosphor-icons/react`). The stroke follows the text beside it:
**bold** in buttons, chips and next to semibold headings, regular in body
text; **fill** only for pressed votes and the verified shield. Each trust
icon has one meaning everywhere: filled **shield** = certificate checked by
a moderator; **certificate** = certification claimed by the spot; **check
circle** = a member checked the halal status; **gavel** = moderation.
Decorative icons are `aria-hidden`; icon-only buttons have an accessible
name and a tooltip.

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
* Safe-area insets on all four sides (the top bar, toolbar, bottom bar, side
  panels, sheets and toasts), so landscape phones keep controls out of the
  notch. Touch targets are at least 24 px everywhere (WCAG 2.5.8) and 44 px
  on touch screens for the controls people use most (`pointer-coarse:`
  sizes, or a pseudo-element extending a small button's hit area);
  `-webkit-tap-highlight-color: transparent`, with visible `:focus-visible`
  rings instead.
* On short landscape screens (under 32 rem tall) the toolbar keeps only the
  compass and the place tools; zoom and rotate stay on gestures and keys.
* When a side panel is open between 48 and 80 rem wide, the bottom bar moves
  right so the panel does not cover it.

## Writing

Short, concrete, friendly, in both languages. Halal vocabulary is precise: *halal level* (all / some dishes / not stated),
*certification claim* (certified / self-declared / community) and *verified*
(a moderator checked the certificate) are never mixed up, and votes are
described as community trust, not certification.
