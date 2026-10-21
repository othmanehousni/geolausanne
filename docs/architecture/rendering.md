# Rendering

Everything 3D lives under [`components/world/`](../../apps/web/src/components/world)
and [`lib/world/`](../../apps/web/src/lib/world), rendered with three.js
through React Three Fiber ([ADR 0002](../decisions/0002-react-three-fiber.md)).

## Mounting

* `WorldCanvas` loads the scene with `next/dynamic` and `ssr: false`: three.js,
  R3F and the tile workers only download after the overlay UI is interactive.
* WebGL support is detected once (WebGL 2, else WebGL 1) through
  `useSyncExternalStore`. Without it, `MapStatus` explains the problem and
  offers the spots list, which works without 3D.
* An error boundary catches crashes inside the canvas and shows a "reload"
  card instead of a blank page; a failed manifest offers "retry".
* The `<canvas>` is `aria-hidden`: its accessible name, role, help text and
  keyboard model live on the wrapping map region
  ([accessibility](../design/accessibility.md#the-3d-map)).

## Canvas and camera

* `fov` 45°, far plane 90 km; the near plane follows the zoom (1 % of the
  camera distance, 0.5–40 m) to keep depth precision when looking at a pin
  from 30 m or at the Alps from 9 km.
* sRGB output, **no tone mapping**: colours on screen are the palette colours
  of [materials](../pipeline/materials.md). No alpha, no stencil, high-performance
  GPU preference; pixel ratio and MSAA from the quality preset.
* drei `MapControls` (pan with one finger / left button, rotate with two
  fingers / right button), damping 0.09, **zoom to cursor**, distance
  25–9 000 m, polar angle 0.08–0.47π so the camera never goes under the
  ground, and the target is clamped to the city's bounds.
* Scripted moves (search results, home, compass, keyboard) go through a
  command queue in the world store; flights use a cubic ease-in-out lasting
  600–1 600 ms depending on the distance, and are **instant with reduced
  motion**. Initial view: above the lake shore looking north over Flon to the
  cathedral.

## Light and atmosphere

* A hemisphere light (sky/ground) plus one directional "sun" from the
  south-west; flat shading everywhere (the voxel look).
* A sky dome with a zenith-to-horizon gradient and linear fog from 2.2 km to
  17 km, which hides the end of the horizon mesh.
* **Day and night** follow the interface theme (dark theme = night): sky, fog,
  lights and the `uNight` uniform are blended, so windows light up, the lake
  darkens and markers glow.

## Materials

Two material families, both `MeshLambertMaterial` patched with
`onBeforeCompile` ([`lib/world/materials.ts`](../../apps/web/src/lib/world/materials.ts)):

* **voxel**, one instance per level of detail (it needs the voxel size):
  normals from screen-space derivatives, per-voxel brightness jitter, windows
  on walls, roof jitter, per-tree tint and sway on instanced trees;
* **water**: ripples, Fresnel blend to the sky and sun glints, faded with
  distance.

Shader classes come from the alpha channel of the vertex colours
([materials](../pipeline/materials.md#shader-classes)). Program cache keys
are per material kind, so all tiles of a level share one compiled program.

## Horizon

`horizon.glb` is decoded through the same worker pool (`loadScene`) and drawn
with the voxel and water materials; a large flat lake ring under it extends
the water to the fog. See [horizon](../pipeline/horizon.md).

## Place markers

* Up to 1 000 pins drawn with **two instanced meshes** (stems and heads), one
  draw call each, whatever the number of spots.
* A pin's base sits on the surface currently drawn at its location (downward
  ray against the loaded tiles, so it follows the level of detail and stands
  on roofs), falling back to the stored elevation.
* Pins keep a roughly constant on-screen size (never smaller than 3 m), bob
  and spin slowly (both off with reduced motion). Colours: saffron for spots,
  gold for spots whose certificate a moderator verified, dimmed for spots with
  a negative score. The selected pin is larger and has a pulsing ring; heads
  glow at night.
* Name tags for the hovered and the selected spot use drei's `<Html>`. They
  are **always mounted** and only their text changes: drei's `<Html>` owns a
  separate React root, and unmounting it during a render (React 19) caused
  `removeChild` errors and half-closed dialogs. Their positions are updated in
  the frame loop, not through React state.

## Picking and placement

* Clicking a pin selects it (instanced-mesh hit → place id). Clicking the
  ground during placement picks a world point with a BVH ray cast against the
  drawn tiles ([streaming](streaming-and-lod.md#7-markers-and-picking)).
* `PlacementPicker` shows the crosshair state; "use map centre" casts a ray
  through the middle of the screen, which is also what **Enter** does on the
  focused map.
* `UserLocationMarker` shows the visitor's position after "Go to my
  location" (never sent anywhere).

## Frame budget notes

* **Frame loop.** Every frame while the map is visible. While a modal
  overlay covers it (sign-in, submit form, report, profile, the phone spots
  list), `useCoverMap` switches R3F to on-demand rendering (frames only for
  resizes and finished tiles) and the `Pacing` component unmounts drei's
  `PerformanceMonitor`, so sparse frames are not taken for a slow device.
  Full-rate rendering resumes 500 ms after the overlay closes, once its exit
  transition is over. The scene simply holds still behind the modal; phones save
  battery, and software-rendered CI machines keep their main thread free.
* Frustum culling and the LOD walk run every frame but only visit a few
  hundred quadtree nodes (refinement stops where voxels are small enough);
  statistics are pushed to React at most every 400 ms.
* Tile meshes have `matrixAutoUpdate = false`.
* Everything heavy (network, inflate, meshopt decoding, de-interleaving) is
  in workers; the main thread only wraps transferred buffers into
  `BufferGeometry`.
