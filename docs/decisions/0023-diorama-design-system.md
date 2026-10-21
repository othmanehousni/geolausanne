# 0023. "Diorama": Geist, pixel accents and islands over the city

Status: accepted · Date: 2026-10-21 · Supersedes the typography and colour
parts of the first design system ("Lac & Molasse", see
[0014](0014-ui-stack.md) for the stack, which stays)

## Context

After the first build the owner found the interface bland ("I don't really
like the design of the GUI… make it aesthetic and feel alive while being
minimalistic") and asked again for the Emil Kowalski design-engineering and
"Make Interfaces Feel Better" skills. At the same time the city itself was
being recoloured with real building, roof and ground colours in a
pixel-art style ([rendering](../architecture/rendering.md)), so the
interface had to frame a much more colourful scene. What made the first
interface bland: a cool lake-mist palette that matched nothing on screen,
one humanist typeface everywhere, flat cards, a list of equal-weight
buttons in the spot panel, and almost no feedback when something changed.

## Decision

* **Palette**: warm paper and ink neutrals (`oklch(0.975 0.005 85)` /
  `oklch(0.205 0.012 265)`) that sit quietly beside any city colour;
  saffron stays the single accent (spots and adding them); lake blue only
  for focus rings and verified facts. Every pair is re-measured by
  `scripts/check-contrast.py`; all text is ≥ 4.5:1 and every state
  indicator ≥ 3:1 (focus rings became solid for this).
* **Type**: Geist for reading, **Geist Pixel** for the voxel accents (the
  wordmark, counts and scores, the 404), Geist Mono for hours and keys, all
  three self-hosted through `next/font` (SIL OFL, free).
* **Brand**: a pixel-art voxel (16 × 15 cells) shared by the UI, the
  generated icons, the favicon and the social image.
* **Shape**: islands and buttons are pills; panels and dialogs 28 px with
  concentric inner radii; depth from a "shadow as border" (1 px ink ring +
  lift + ambient shadow).
* **Layout**: three islands in the top bar; one **dock** with the two main
  actions; in the spot panel a **trust card** (raised vote pill + what the
  votes add up to) and three **action tiles** with Directions as the one ink
  tile; grouped info list; avatar-led reviews.
* **"Alive", within the motion rules**: rolling count and a one-shot dot
  ping in the dock, rolling score, a capped 22 ms stagger when the list
  opens, a cross-fade when switching spots, a once-per-browser hint chip,
  a bobbing cube only on the 404 page. Everything respects reduced motion.

## Alternatives

* **Keep Atkinson Hyperlegible Next** for its legibility: it is excellent
  for long text but reads as "accessibility tool" rather than "city map",
  and its wide forms made the islands crowded. Geist has comparable
  disambiguation for the characters that matter here (`Il1`, `0O`) at UI
  sizes, and contrast and size rules carry most of the legibility.
* **A pixel font everywhere**: on-theme, but tiring to read and poor for
  low-vision readers; pixel type is used as a texture only.
* **Glass (blur) panels** for the spot panel and dialogs too: pretty in a
  screenshot, but long text over a moving 3D scene loses contrast and the
  blur is re-composited every frame; panels stay solid.
* **A second accent (blue Directions button)**: more colourful, but the
  interface is meant to be the calm layer; Directions is ink instead.

## Consequences

* The interface looks deliberate and lighter, and the city carries the
  colour. Counts and scores have a recognisable pixel voice.
* Geist Pixel's zero is slashed (`1Ø`); accepted as part of the pixel look.
* Three font files instead of three before (no size change of note).
* Accessible names did not change (the short "Report" label keeps "Report
  a problem" as its name), so the end-to-end tests and the axe scans run
  unchanged.
* The design system page ([design/design-system.md](../design/design-system.md))
  is rewritten; component notes are in
  [design/components.md](../design/components.md).
