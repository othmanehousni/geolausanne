# 0015. The 3D map as an ARIA application region with a list alternative

Status: accepted · Date: 2026-10-21

## Context

A WebGL canvas is invisible to screen readers and, by default, unusable with
a keyboard. The owner asked for best ARIA/accessibility standards. The target
is WCAG 2.2 level AA.

## Decision

* The canvas is `aria-hidden`. It sits inside a focusable region with
  **`role="application"`**, `aria-roledescription` ("3D map"), a label and a
  hidden help text (`aria-describedby`) listing the keys.
* **Keyboard model while the map has focus** (WCAG 2.1.4: single-key
  shortcuts only work when the map is focused): arrows/WASD pan, +/− zoom,
  Q/E rotate, Page Up/Down tilt, N north, H/Home home view, "/" search, Enter
  picks the map centre while adding a spot. Ctrl/⌘ K focuses the search from
  anywhere.
* **An equivalent without 3D**: the spots list (a drawer with filters) gives
  access to every spot shown on the map, and search reaches any spot or
  street; opening a spot never requires pointing at a pin.
* **Announcements** through one polite live region: city ready, location
  found, the chosen search result (or that it lies outside the 3D city), the
  new score after a vote, placement instructions. The search box reports its
  result count in its own status region.
* Dialogs and drawers come from Base UI (focus trapping, return focus,
  Escape, labelled by their titles). The mobile bottom sheet expands when
  keyboard focus moves into its hidden part (WCAG 2.4.11 focus not obscured).
* Reduced motion: camera flights become instant, markers stop bobbing, trees
  stop swaying, keyframe animations are shortened.
* **Automated checks**: `eslint-plugin-jsx-a11y` (recommended rules) and axe
  (WCAG 2.0/2.1/2.2 A and AA tags) on every page and on open dialogs in the
  end-to-end tests.

Details: [design/accessibility.md](../design/accessibility.md).

## Alternatives

* **Hiding the map from keyboard users** and offering only the list: loses
  the main experience for sighted keyboard users.
* **A per-pin focusable overlay** (DOM buttons positioned over pins): hundreds
  of tab stops, positions changing every frame; the list does this job
  better.
* **`role="img"` with a description**: wrong for an interactive widget.

## Consequences

* `jsx-a11y` does not know `application` is interactive; the region carries
  a documented, scoped lint exception.
* Screen-reader users get a list-first experience; the 3D view remains a
  visual enhancement, which is honest about what a canvas can convey.
