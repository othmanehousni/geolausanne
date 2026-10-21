# Accessibility

Target: **WCAG 2.2 level AA**, on desktop and phones, with keyboard, screen
readers, zoom and reduced motion. Decision record:
[ADR 0015](../decisions/0015-accessible-3d-map.md).

## The 3D map

A WebGL canvas cannot be read by assistive technology, so:

* The `<canvas>` is `aria-hidden`. It is wrapped in a focusable region
  (`MapRegion`) with `role="application"`, the label "3D map of Lausanne with
  halal food spots", `aria-roledescription="interactive 3D map"` and a hidden
  help text (`aria-describedby`) that lists the keys below.
* A **skip link** ("Skip to the map") is the first focusable element and
  moves focus to the region.
* **Keys, only while the map has focus** (WCAG 2.1.4 character key
  shortcuts):

| Key | Action |
| --- | --- |
| ← ↑ → ↓ or W A S D | pan, relative to the current heading |
| + / − | zoom in / out |
| Q / E | rotate left / right |
| Page Up / Page Down | tilt |
| N | face north |
| H or Home | back to the home view |
| / | jump to search |
| Enter | while adding a spot: use the map centre |
| Ctrl K / ⌘ K (anywhere) | jump to search (`aria-keyshortcuts` on the search box) |

* **Dragging has alternatives** (WCAG 2.5.7): every camera movement is also
  available from the toolbar (zoom, compass to face north, rotate, home,
  locate) and from the keyboard.
* **Pins are not the only way to a spot** (WCAG 1.1.1, 2.1.1): the *spots
  list* (a drawer listing the spots in view, with filters) and the *search*
  reach every spot; a deep link `?spot=<id>` opens one directly.
* A visible focus ring is drawn inside the map region when it has keyboard
  focus.

## Live announcements

One polite live region (`LiveRegion` + `announcer-store`) says what visual
changes mean: the city is ready, your location was found, the place a search
result flew to (or that it lies outside the 3D city), the new score after a
vote, the instructions when placement starts. The search box has its own
status region with the number of results. Toasts (Base UI Toast) are
announced by their own region and can be closed by keyboard.

## Components

| Part | Semantics |
| --- | --- |
| Search | Base UI **Autocomplete** (combobox pattern): grouped results ("Halal spots", "Streets and places"), arrow keys, Enter, Escape; result count in a status region |
| Toolbar | Base UI **Toolbar** (`role="toolbar"`, roving arrow-key focus, label "Map controls"); every icon button has a name and a tooltip |
| Spot panel | Base UI **Drawer**, named by its title (the spot's name); non-modal on desktop so the map stays usable; on phones a bottom sheet whose hidden part **expands when keyboard focus enters it** (WCAG 2.4.11 focus not obscured) |
| Vote control | Base UI **ToggleGroup** labelled "Vote for {spot}", two toggles "Upvote"/"Downvote" with `aria-pressed`; disabled with an explanation on your own spot; the new score is announced |
| Spots list | Base UI Drawer (modal on phones), filters as a ToggleGroup, each spot a button |
| Forms | Base UI **Form / Field / Fieldset**: every control has a label, hints are linked descriptions, errors are shown next to the field and linked; radio groups (`ChoiceCards`) have a legend and every option is named by its own card (`Field.Item` per option) |
| Dialogs | Base UI Dialog / AlertDialog: focus moves in, is trapped and returns, Escape closes, named by their title, outside content hidden from assistive technology |
| Menus | Base UI Menu with radio groups (theme, language) and link items |
| Ratings | input: a radio group of stars named "4 out of 5" etc.; display: stars plus a visually hidden "4.5 out of 5" |

## Visual

* Contrast meets AA for all text tokens in both themes, focus rings ≥ 3:1
  ([design system](design-system.md#colour)); state never relies on colour
  alone.
* Text resizes with the browser; the layout is responsive (tested at 412 px
  and 1 440 px wide); inputs are 16 px on phones.
* `prefers-reduced-motion`: no camera flights, no bobbing, no sway, instant
  keyframe entrances; `prefers-reduced-transparency`: solid panels instead of
  frosted glass.
* `<html lang>` follows the locale, and language names in the switchers carry
  their own `lang` (WCAG 3.1.2, language of parts).

## How it is checked

* **Lint**: `eslint-plugin-jsx-a11y` recommended rules on every file. One
  scoped exception: `role="application"` on the map region (the plugin does
  not list `application` as an interactive role).
* **axe** (`@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`,
  `wcag21aa`, `wcag22aa`) in the end-to-end tests, on desktop and Pixel 7
  profiles: the map page once the city is loaded, the sign-in dialog, the
  submit form, the spots list, an open spot panel, and the about, privacy and
  terms pages (French and English). Any violation fails the build.
* **Keyboard flows** in the end-to-end tests: skip link → map → shortcuts →
  search (`/` and Ctrl K); on phones, tabbing into the peeking bottom sheet
  expands it before the review form is opened with Enter.
* **Component tests** (Testing Library) query by role and name, so a lost
  label fails a test (e.g. `ChoiceCards.test.tsx`, `VoteControl.test.tsx`).

## Known limits and next steps

* The 3D scene itself is not described (buildings, streets); screen-reader
  users get a list-first experience, and each spot panel gives the address.
* No testing with real screen readers (NVDA, JAWS, VoiceOver, TalkBack) has
  been possible in the build environment; it should be done before a public
  launch (checklist in [operations/testing.md](../operations/testing.md#manual-checks-before-a-release)).
* Pins cannot be focused one by one on purpose (hundreds of moving tab stops);
  the list replaces them.
