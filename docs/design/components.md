# Components and where they come from

Every interactive primitive is Base UI; styling follows the shadcn
"base-nova" conventions; icons are Phosphor. This page maps each part of the
interface to its building blocks and records what was taken from the
component survey ([research/ui-component-survey.md](../research/ui-component-survey.md)).

## Map screen

| Part | Built from | Notes |
| --- | --- | --- |
| Top bar | brand mark + `SearchBox` + `AccountMenu` | the brand is the page's `h1` |
| `SearchBox` | Base UI `Autocomplete` (grouped, `filter={null}`, async) | community spots and swisstopo locations in two groups; `Kbd` hint ⌘K / Ctrl K; results announced; offline and failed searches say so (never "nothing found"); street search gives up after 8 s; on phones the results are anchored to a screen-wide virtual element under the field |
| `AccountMenu` | Base UI `Menu` (shadcn `dropdown-menu`) | radio groups for theme and language, a Reduce motion checkbox item, link items (about, privacy, terms, source code, moderation), profile, sign out; initials are grapheme-aware (`lib/initials.ts`) |
| `MapToolbar` | Base UI `Toolbar` + `Tooltip` | zoom (desktop), compass (shows heading, resets north), rotate, home, locate, day/night |
| `BottomBar` | buttons | spot count opening the list; saffron "Add spot" (the one primary action) |
| `Attribution` | text + Base UI `Popover` | © swisstopo, © OpenStreetMap contributors; demo-mode notice |
| `MapStatus` | `Spinner`, `Button` | first-view pill; a notice with "Try again" when blocks keep failing; no-WebGL, crash and manifest-error cards centred on the screen (the retry keeps the card and its focus) |
| `PickingBanner` (in `AddSpotFlow`) | glass pill + buttons | crosshair state, "Use map centre", "My location", cancel |

## Spots

| Part | Built from | Notes |
| --- | --- | --- |
| `PlacePanel` | Base UI `Drawer` | left side panel on desktop (non-modal); bottom sheet with snap points on phones; states: spot, loading, offline, failed (retry), not found; Escape is ignored while a review draft has changes |
| `PlaceDetails` | `HalalBadges`, info list, buttons, `ModeratorTools` | directions (OpenStreetMap), copy link, report |
| `VoteControl` | Base UI `ToggleGroup` + `Toggle`, **NumberFlow** | **recreated** Bencho Pro "feedback bar" behaviour (pop on upvote, shake on downvote, rolling digits), optimistic with rollback |
| `HalalBadges` | badges + Phosphor icons | halal level, certification claim, verified seal, alcohol |
| `Reviews`, `ReviewForm` | Base UI `Form`, `Field`, `RadioGroup` (`StarRating`), `Checkbox`, `ChoiceCards` | a halal confirmation requires a method |
| `ReportDialog` | Base UI `Dialog`, `ChoiceCards`, `Field` | reason + details; the form is keyed per opening, so nothing carries over from the last report |
| `SpotsList` | Base UI `Drawer`, `ToggleGroup` filters | modal on phones; score badges with tone and text |
| `SubmitPlaceDialog` | Base UI `Dialog`, `Form`, `Field`, `Fieldset`, `Collapsible` (more details), `ChoiceCards` | reverse-geocoded address suggestion, nearby spots, validation messages per field |

## Accounts and moderation

| Part | Built from |
| --- | --- |
| `AuthDialog` | Base UI `Dialog`, `Form`, `Field`; OAuth buttons; `Turnstile` (Cloudflare script, loaded only when configured) |
| `ProfileDialog` | Base UI `Dialog`, `Form`, `Field` |
| `AuthCallback` | status page with `Spinner` |
| `ModerationConsole` | Base UI `Tabs` (reports, removed, hidden, log), cards with note fields, `AlertDialog` for deletion |

## Form helpers

* `components/form/form-field.tsx`: `FormField`, `FormLabel`,
  `FormDescription`, `FormError`, `FormInput`, `FormTextarea`, `FormFieldset`,
  `FormLegend` over Base UI `Field` and `Fieldset`.
* `ChoiceCards`: a Base UI `RadioGroup` rendered as selectable cards inside
  `Field` + `Fieldset`; each option is wrapped in `Field.Item` so it is named
  by its own card (a bug found by the end-to-end tests: all radios were named
  after the first card).

## shadcn primitives in `components/ui`

alert-dialog, button, dialog, dropdown-menu, kbd, popover, skeleton,
spinner, toast and tooltip, plus `labels.tsx` (shared accessible labels such
as "Close" for dialogs and sheets). They were adjusted for the design rules:
explicit transition properties, press feedback, decorative spinners hidden
from assistive technology, translated close labels. The other 25 primitives
installed at the start (badge, card, select, sheet, switch, tabs…) were never
imported (drawers, tabs, radios and checkboxes use Base UI directly) and were
removed in the second pass, partly because the motion audit found defects
in them that anyone adopting them later would inherit; `bunx shadcn add
<name>` brings one back.

## Taken from the survey, and how

| Idea (source) | What we did |
| --- | --- |
| Feedback bar (Bencho, **Pro**) | recreated from a behaviour spec on Base UI ToggleGroup; no Pro code viewed or copied |
| Rolling counter (Bencho free, MIT) / number ticker (beUI) | NumberFlow (MIT), already a dependency |
| Morphing search chips (beUI), search pill (shwn.design, not distributed) | inspired the pill-shaped Base UI Autocomplete; no code copied |
| Dock (beUI) | a Base UI Toolbar in a vertical glass pill |
| Bottom sheet (beUI) | Base UI Drawer with snap points (no vaul/Radix) |
| Animated badge (beUI) | static badges with icons: halal status should not wiggle |
| Key-cap segmented filter (shwn.design) | Base UI ToggleGroup filters in the spots list |
| Cubes hero (React Bits, MIT + Commons Clause) | not used: the city is the hero, and a second WebGL context would compete with it |
| Command palette (beUI) | not needed: search is always visible and has ⌘K |
| Directory sites (designeer, 21st.dev) | used for discovery only |
