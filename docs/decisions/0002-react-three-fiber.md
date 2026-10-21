# 0002. three.js through React Three Fiber, WebGL

Status: accepted · Date: 2026-10-20

## Context

The product is "a miniature Minecraft-style Lausanne", freely rotatable,
not a conventional map. The blueprint chose three.js as the primary renderer
(not MapLibre), React Three Fiber for composition, and WebGL rather than
WebGPU for the MVP. The rest of the interface is a React app with many
overlays (search, panels, dialogs).

## Decision

* **three.js 0.186 + React Three Fiber 9 + drei 10**, WebGL 2 with a WebGL 1
  fallback (the renderer decides; we only check that a context exists).
* drei **`MapControls`** rather than `OrbitControls`: map-style gestures
  (one finger pans, two fingers rotate and tilt), zoom to the cursor, with our
  own limits (25 m–9 km, never under the ground, target clamped to the city).
* Custom shaders through `onBeforeCompile` on `MeshLambertMaterial`, so
  three.js keeps handling lights, fog and colour management.
* `three-mesh-bvh` for ray casting against streamed tiles.

## Alternatives

* **MapLibre GL / deck.gl**: built for map tiles and 2.5D extrusions with a
  map camera; voxels and a free camera fight the abstraction.
* **CesiumJS**: a full globe engine (WGS84 ellipsoid, 3D Tiles); heavy, and
  the geometry would still have to be voxelised by us.
* **Babylon.js**: capable, but R3F integrates naturally with the React UI and
  its state.
* **Plain three.js without R3F**: possible, but the canvas would need a
  hand-written bridge to React state; R3F gives declarative composition and
  hooks (`useFrame`) at no measurable cost.
* **WebGPU**: not yet available everywhere the site must work (older iOS
  Safari, some Android and Linux browsers); nothing here needs compute
  shaders.

## Consequences

* R3F renders in its own React root, so state shared between the DOM overlay
  and the canvas lives in zustand stores, not React context.
* drei's `<Html>` (name tags) owns yet another React root; unmounting it
  during a render broke React 19 reconciliation, so tags stay mounted
  ([rendering](../architecture/rendering.md#place-markers)).
* The 3D bundle is loaded client-side only (`next/dynamic`, `ssr: false`)
  after the overlay is interactive.
