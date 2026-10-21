# 0014. Base UI via shadcn, Phosphor icons, recreated pro components

Status: accepted · Date: 2026-10-21

## Context

The owner asked for clean Base UI primitives wherever possible, the shadcn
registry for Base UI, Phosphor icons, the "Make Interface Better" and Emil
Kowalski design-engineering guidance, and inspiration from eleven component
sites (designeer, shwn.design, Spectrum UI, ObsidianUI, Bencho, beUI, Rare UI,
21st.dev, React Bits, lab.anishfn.ink, dqnamo's kitchen), recreating anything
paid instead of buying it. Accessibility is a hard requirement.

## Decision

* **Base UI** (`@base-ui/react`) for every interactive primitive: Dialog,
  AlertDialog, Drawer (place panel and spots list), Autocomplete (search),
  Toolbar, Menu, Tooltip, Popover, Toggle/ToggleGroup, RadioGroup, Checkbox,
  Field/Fieldset/Form, Collapsible, Tabs, Toast.
* **shadcn with the `base-nova` style** for the styled wrappers in
  `components/ui` (copied source, not a dependency), Tailwind v4 tokens in
  `globals.css`.
* **Phosphor icons** (`@phosphor-icons/react`), decorative icons hidden from
  assistive technology, icon-only buttons labelled.
* **NumberFlow** for the animated score.
* **No Radix, no cmdk, no vaul, no framer-motion**: they would duplicate Base
  UI and add weight. Animations are CSS transitions and keyframes.
* **Recreated, not bought**: the vote control reproduces the *behaviour* of
  Bencho's Pro "feedback bar" (pop on upvote, shake on downvote, rolling
  digits) on Base UI's ToggleGroup, from a written spec; no Pro code was
  viewed or copied. Other ideas from the survey (search pill, key-cap
  segmented filters, expanding toolbars) informed the look of our own Base UI
  components.

The full survey of the eleven sites (licences, what is free, what depends on
Radix) is in [research/ui-component-survey.md](../research/ui-component-survey.md);
the resulting component map is in [design/components.md](../design/components.md).

## Alternatives

* **Radix-based shadcn**: the default shadcn flavour; the owner asked for
  Base UI, which also offers the Drawer with snap points and the Autocomplete
  we needed.
* **Installing beUI or React Bits components as-is**: several are excellent
  (MIT), but they bring `motion` and `lucide-react`, and some (React Bits) carry
  a Commons Clause. Their ideas were reimplemented on Base UI where useful.
* **21st.dev installs**: need an API key and are limited on the free plan.
* **A WebGL hero (React Bits "Cubes")**: the map itself is the hero, and a
  second WebGL context on the same page would compete with the city.

## Consequences

* One primitive library to learn; consistent focus management, keyboard
  support and ARIA semantics across all overlays.
* The styled components are ours to maintain (shadcn copies source).
* Bundle stays lean: no animation library, one icon set.
