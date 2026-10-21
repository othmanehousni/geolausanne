# UI component survey (October 2026)

The owner listed eleven component sites to draw from, with the rule: anything
"pro" or behind a subscription is recreated, not bought. This survey was done
on 20–21 October 2026 by fetching each site, its registry files and its
licence (pages and code treated as data; nothing downloaded was executed).
Outcome in one line: **Base UI for every interactive primitive, NumberFlow
for numbers, our own components inspired by the best ideas, one Pro behaviour
recreated (the vote control)**. What was finally built is mapped in
[design/components.md](../design/components.md); the decision is
[ADR 0014](../decisions/0014-ui-stack.md).

## Summary

| Site | What it is | Licence | Free / paid | Radix? | Verdict |
| --- | --- | --- | --- | --- | --- |
| designeer.xyz | curated directory (no code) | inspiration only | free; sponsored slots | – | discovery: led to NumberFlow, loading.dev, Base UI registries |
| shwn.design | design-engineer portfolio: 13 prototypes on Base UI + motion; Dot Matrix and Orbkit registries | prototypes unlicensed; Dot Matrix custom proprietary | free | no | inspiration (search pill, key-cap tabs, toolbar) |
| ui.spectrumhq.in (Spectrum UI) | 315-item library | Apache-2.0 | free | mixed | several items are copies of beUI; small zero-dep extras |
| obsidianui.dev | showcase components + shadcn-style primitives | MIT | free | yes (primitives) | low fit (Radix) |
| bencho.dev | ~130 live micro-interactions | MIT for free blocks | 25 free / 79 **Pro** (€79/year) | no | reference; **Pro feedback bar recreated** |
| beui.dev | 144 animated components | MIT | free (separate paid "Pro" not needed) | no | best free source; ideas reimplemented on Base UI |
| rareui.com | 26 single-file components | MIT + Commons Clause + required attribution link | free | some | low fit |
| 21st.dev | community marketplace (12k+) | per author | 2 installs/day free, then paid | varies | discovery; install from origins instead |
| reactbits.dev | ~420 animated components ×4 flavours | MIT + Commons Clause | free (separate Pro) | no | "Cubes" considered for a hero, not used |
| lab.anishfn.ink | personal lab (14 pieces) | none stated | free | no | inspiration (pixel-art-to-voxel tool) |
| dqnamo.com/kitchen | 15 experiments, motion + Phosphor | none on site; MIT on 21st | free | no | inspiration (dynamic button, scroll-fade list) |

Base UI facts that shaped the build: the `Drawer` supports snap points and a
non-modal mode (bottom sheet on phones, side panel on desktop), the
`Autocomplete` handles async grouped results, `Toolbar` gives roving focus,
`Field`/`Fieldset`/`Form` wire labels, descriptions and errors, and
`Tabs.Indicator` exposes the active tab's geometry.

## Per site (short)

**designeer.xyz.** An editorial catalogue (resources, tools, portfolios) with
pricing tags; nothing to install. Useful leads: NumberFlow (MIT), loading.dev
(MIT), Base UI-based shadcn registries (coss ui, Base CN, Cubby UI, Re UI).
Caution noted: the coss repository root is AGPL-3.0 while some mirrors label
items MIT.

**shwn.design.** Thirteen polished prototypes (Search, Tabs, Toolbar, Dial,
…) built on Base UI primitives with `motion`, not published and unlicensed:
inspiration only. Its Dot Matrix loaders ship as a shadcn registry under a
custom licence (use allowed, redistribution not). Takeaways: the pill search,
the key-cap segmented control, the expanding tools pill.

**Spectrum UI.** Apache-2.0, entirely free; older items depend on Radix,
`vaul` and `cmdk`; several new items are beUI copies. Small useful ideas:
skeleton-to-content reveal, status pills, undo pill.

**ObsidianUI.** MIT; its primitives are Radix-based, blocks pull in gsap and
three.js. Low fit for an app that already standardised on Base UI.

**Bencho.** MIT micro-interactions; 25 blocks free with source, 79 Pro. Free
references: rolling counter, toast stack, dynamic island, upload dropzone.
Pro "feedback bar" (thumbs up/down with a "why?" follow-up) matched the vote
control: **recreated from a written behaviour spec** (pop on upvote, shake on
downvote, rolling digits, pressed states), without viewing Pro code. Pro
loaders derive from loading.dev (MIT); "price flow" ≈ NumberFlow.

**beUI.** MIT, `motion` + `clsx`, no Radix, its own ARIA. Strong pieces: the
morphing search chips bar, command palette, dock, bottom sheet, toast stack,
number ticker, animated badge, loader variants, segmented tabs, stateful
button. They were the main visual inspiration; our versions are Base UI
components without `motion` or `lucide-react`.

**Rare UI.** MIT + Commons Clause and a mandatory visible link to rareui.com;
the most interesting component (a morphing "family" drawer) depends on
`vaul`/Radix. Not used.

**21st.dev.** A marketplace with per-author licences; installs need an API
key and are capped at two per day on the free plan. Used to discover
originals (NumberFlow, dqnamo's components, coss's async autocomplete).

**React Bits.** MIT + Commons Clause (no redistribution of the components).
"Cubes" (WebGL cube grid) looked like a voxel hero, but the map itself is the
hero and a second WebGL context would compete with the city; not used.

**lab.anishfn.ink.** No licence stated; one registry item ("Shapeshift", a
natural-language input). Its pixel-art-to-voxel tool is thematic inspiration.

**dqnamo's kitchen.** Small polished experiments built with motion and
Phosphor (same icon set as ours); MIT on 21st.dev. Ideas noted: dynamic
button width, scroll-fade lists, hold-to-confirm.

## Flags that excluded components

* **Radix dependencies** (duplicate primitives): shadcn's `command` (cmdk),
  anything on `vaul`, ObsidianUI primitives, several Spectrum and Rare UI
  items.
* **Heavy dependencies on the map route**: three/R3F stacks, gsap, ogl,
  shader backgrounds, liquid-glass SVG filters (expensive over a WebGL
  canvas).
* **Licences**: Commons Clause (React Bits, Rare UI + attribution), custom
  proprietary (Dot Matrix), no licence (shwn.design prototypes, lab.anishfn.ink),
  AGPL at the coss repository root.
* **Access**: 21st.dev API key and daily cap.

## Recreated behaviour specs (summary)

* **Vote control** (from Bencho Pro "feedback bar"): pill with up/down
  toggles and the score between; pressed state with filled icons and tinted
  background (upvote green, downvote rose); upvote "pop" keyframe (scale 1.3,
  −10°, 420 ms overshoot curve), downvote "shake" (380 ms); NumberFlow digits
  rolling in the vote direction; group labelled "Vote for {spot}", toggles
  with `aria-pressed`; optimistic with rollback; signed-out visitors are asked
  to sign in and the vote resumes. The optional "why?" chips became the
  separate report dialog.
* Other specs written during the survey (expanding tab bar, search pill,
  key-cap filter, expanding tools pill) informed styling only.
