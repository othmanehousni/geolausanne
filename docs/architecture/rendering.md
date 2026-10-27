# Rendering

Everything 3D lives under [`components/world/`](../../apps/web/src/components/world)
and [`lib/world/`](../../apps/web/src/lib/world), rendered with three.js
through React Three Fiber ([ADR 0002](../decisions/0002-react-three-fiber.md)).

## Mounting

* `WorldCanvas` loads the scene with `next/dynamic` and `ssr: false`: three.js,
  R3F and the tile workers only download after the overlay UI is interactive.
* WebGL 2 support is detected once through `useSyncExternalStore` (the test
  context is released at once). three.js 0.186 needs WebGL 2, so a browser
  with WebGL 1 only gets the same card as one without WebGL: `MapStatus`
  explains the problem and offers the spots list, which works without 3D.
* An error boundary catches crashes inside the canvas and shows a "reload"
  card instead of a blank page; a failed manifest offers "retry". The card
  is centred on the screen and stays, with a spinner, while a retry runs;
  if the city then loads, focus moves to the map.
* The `<canvas>` is `aria-hidden`: its accessible name, role, help text and
  keyboard model live on the wrapping map region
  ([accessibility](../design/accessibility.md#the-3d-map)).

## Canvas and camera

* `fov` 45°, far plane 90 km; the near plane follows the zoom (1 % of the
  camera distance, 0.5–40 m) to keep depth precision when looking at a pin
  from 30 m or at the Alps from 9 km.
* **Pixel art that follows the zoom.** The canvas renders at a low
  resolution and the browser scales it up with `image-rendering: pixelated`.
  Up close one rendered pixel covers `QUALITY[q].pixelSize` CSS pixels: 2 on
  wide screens and 1.5 under 640 px on the medium and high presets, 3 and 2
  on low. Pixels then shrink as the camera pulls back (`pixelSizeAt`, a
  smoothstep between orbit distances of 1.2 and 3.2 km) to 1 CSS pixel (1.5
  on low): large pixels are the voxel look up close, but from afar they
  turned whole districts into noise. The size is rounded to a whole number
  of device pixels (`devicePixelsFor`), with a quarter-pixel hysteresis so
  the resolution does not flicker when the zoom rests near a boundary; the
  home view keeps its close-up size on every screen. At the far size the
  medium and high presets antialias the frame (4× MSAA in the frame pass's
  render target, never on the canvas: it would smear large pixels). sRGB
  output, **no tone mapping**, no alpha, no stencil, high-performance GPU
  preference ([ADR 0026](../decisions/0026-pixel-art-rendering-and-real-sky.md)).
* **Changing the resolution without a blank frame.** Resizing a canvas
  clears it, and a resize from a React render showed one empty frame. The
  frame pass picks the resolution for the current view right before it
  draws, calls R3F's `setDpr` (which resizes synchronously) and stores the
  ratio in the world store, which VoxelWorld passes back as the Canvas'
  `dpr` prop: otherwise R3F would reset the ratio at the next React render
  of the canvas.
* **Frame pass** ([`PixelArt`](../../apps/web/src/components/world/PixelArt.tsx)).
  The scene goes to an 8-bit sRGB render target with a depth texture at that
  resolution (resized in the frame the canvas changes); one full-screen
  triangle then
  * fills pinholes: a pixel much farther than three of its four neighbours
    takes the colour of the nearest neighbour (greedy-meshing T-junction
    cracks, about 0.2 % of pixels on SwiftShader);
  * on medium and high, draws 1-pixel dark silhouettes where depth jumps by
    more than 1.5 m plus 3.5 % of the distance, fading out between 700 m and
    3.2 km.
* drei `MapControls` (pan with one finger / left button, rotate with two
  fingers / right button), damping 0.09 (none with reduced motion), **zoom
  to cursor**, distance 25–9 000 m, polar angle 0.08–0.47π so the camera
  never goes under the ground, and the target is clamped to the city's
  bounds. A flight to a point outside them (a search result, a shared link)
  is not started, since it would stop at the edge with nothing said:
  `flyToLv95` calls the caller's `onOutside` instead, and the search box and
  the link say so in a toast (the demo city, or beyond the 16
  municipalities); results outside are marked in the list. Their `start` handler is a stable callback: drei rebuilds the
  controls when it changes, and a rebuild during a drag lost the pointer
  release and left the controls dead until reload.
* Scripted moves (search results, home, compass, keyboard) go through a
  command queue in the world store. **Flights** (search results, home) use a
  cubic ease-in-out lasting 600–1 600 ms depending on the distance. **Steps**
  (zoom, rotate, tilt, face north from the keyboard or the toolbar) take
  240 ms with an ease-out and start from the destination of the move in
  progress, so quick presses add up; a step during a flight keeps the
  flight's remaining time, and keyboard pans shift a running move instead of
  cancelling it. Moves turn **around** the (moving) target: distance,
  heading (the short way round) and tilt are interpolated, not the camera
  position ([`orbit.ts`](../../apps/web/src/lib/world/orbit.ts)). Every move
  is **instant with reduced motion**. Initial view: above the lake shore
  looking north over Flon to the cathedral.
* A flight to a place without a stored elevation lands on the surface drawn
  there, or on an estimate from the manifest (40 % up the finest tile's
  height range) until it is drawn. A shared link resolves before the
  manifest has loaded, so such a flight **waits for the manifest**: the old
  fallback put hilltop spots underground, where no tile is in view and the
  ground probe could never correct it (finding 128).
* **Reduced motion** is the system setting or the visitor's **Reduce
  motion** choice in the account menu (`motionPaused` in the world store,
  remembered in this browser): camera moves are instant; badges, the
  location halo, trees, water, boats and clouds hold still, and birds stay
  away (WCAG 2.2.2).
* **The centre follows the panels**
  ([`ViewportInsets`](../../apps/web/src/components/world/ViewportInsets.tsx)).
  A side panel covers the left 25.5 rem on desktop and the spot sheet the
  bottom 19 rem on phones, so a spot the camera flew to used to sit behind
  them. While one is open the projection is shifted with
  `camera.setViewOffset` (half the covered width to the right; on phones,
  half the sheet minus the top bar upwards), easing in and out over about
  300 ms (at once with reduced motion). The orbit target, the "spots in
  view" query and every control are unchanged; picking a location has no
  shift, so its crosshair stays the middle of the screen. Ray casting and
  the name tags use the same projection, so clicks still land where they
  look.

## Light and atmosphere

* **The real sun.** In day mode the light comes from where the sun is in
  Lausanne right now (NOAA solar position,
  [`lib/world/sun.ts`](../../apps/web/src/lib/world/sun.ts)), clamped to
  daylight: below 7° of elevation the scene shows the instant the sun is at
  7° (evening light until midnight, morning light after). It is updated once
  a minute, also under reduced motion, as a step without animation.
  `setSunTime(ms)` on the world store (reachable through `?debug`) pins the
  instant for screenshots and tests; Playwright's clock cannot be used, as it
  freezes `performance.now()` and with it the frame loop.
* **Light keys**, tuned in linear space with separate morning and evening
  sets: a warm directional sun (2.3 at 7° of elevation, 1.25 at 60°) and a
  cool hemisphere light (2.9–3.2) with a warm brown ground. Tops come out at
  about 0.8–1.0 × their albedo, sunlit walls 0.8–1.1, shaded walls about
  0.45 with a blue cast, undersides about 0.17.
* **Sky**: a banded, dithered gradient with a glow around the sun and a
  crisp sun disc; a moon and stars at night. Linear fog in the horizon
  colour hides the end of the horizon mesh: from 2.2 to 17 km around the
  home view, its start moving out to 1.5 × the orbit distance as the camera
  pulls back (`fogRange`). At a fixed 2.2 km the whole city sat in the haze
  once the camera was 9 km away.
* **Night** (the dark theme): moonlight, lit windows (a share per window
  style), a sodium glow and small street lamps on roads, glowing pools; the
  change cross-fades over about a second (at once with reduced motion), and
  badges glow warm saffron.
* **Season and weather**: `uAutumn` (0 in summer, 1 from early to mid
  November, driven by the date) turns up to 45 % of broadleaf crowns yellow,
  orange or rust. Drifting cloud shadows on the medium and high presets; off
  at night and on low, frozen under reduced motion.

## Materials

Two material families, both `MeshLambertMaterial` patched with
`onBeforeCompile` ([`lib/world/materials.ts`](../../apps/web/src/lib/world/materials.ts)),
with the colour model of [ADR 0025](../decisions/0025-colour-model-from-open-data.md):

* **voxel**, one instance per level of detail (it needs the voxel size):
  normals from screen-space derivatives and per-voxel brightness jitter.
  Vertex RGB is an **sRGB albedo, linearised in the shader** (it used to be
  read as linear, which washed the palette out and was the main cause of
  the "bland" look). The alpha byte is `class << 5 | variant << 2 | ao`;
  format 1 tiles decode with variant and occlusion at 0.
  * **Walls**: windows per style (residential, old, curtain wall,
    industrial, church, none, barn, post-war block), lit at night.
  * **Roofs**: a clay tile mosaic, solar panel frames and glints, patchy
    green roofs, copper, glass reflecting the sky.
  * **Ground patterns**: lawn, pitch stripes, crop and vine rows, paving,
    ballast, flowers.
  * **Shading**: baked occlusion darkens towards blue-grey. Every pattern
    fades to its average below 2–4 rendered pixels per voxel, so distant
    blocks never shimmer.
  * Instanced trees get a per-tree tint, the autumn mix and their sway.
* **water**: lake, shallow and pool variants; ripples and a Fresnel blend to
  the sky; **sun glitter** only along the sun's reflection on gently sloping
  waves (a soft path towards the sun with small twinkling sparkles in 2 m
  cells), faded with distance.

Shader classes come from the alpha channel of the vertex colours
([materials](../pipeline/materials.md#shader-classes)). Program cache keys
are per material kind, so all tiles of a level share one compiled program.

## Horizon

`horizon.glb` is decoded through the same worker pool (`loadScene`) and drawn
with the voxel and water materials; a large flat lake ring under it extends
the water to the fog. Its lake is shaded by distance from the shore with the
tiles' colours (shallow, open, deep), and the ring has the deep colour, so
the tiles' lake continues into it without an edge. A failed download is retried like the blocks (2, 4, 8,
30 s, then every minute) and at once when the browser is back online. See
[horizon](../pipeline/horizon.md).

## Place markers

[`PlaceMarkers`](../../apps/web/src/components/world/PlaceMarkers.tsx) draws
each spot as a small **pixel-art badge**: a rounded saffron badge with the
glyph of its category, a pointer tip on the spot and a soft contact shadow
on the ground ([ADR 0027](../decisions/0027-pixel-badges-in-screen-space.md)).

* **Sprites, drawn in code.** One character per texel, packed into one
  256 × 512 RGBA atlas at start-up
  ([`marker-atlas.ts`](../../apps/web/src/lib/world/marker-atlas.ts), a few
  milliseconds, once): a 15 × 18 badge with an 11 × 11 glyph per category
  (fork and knife, burger, cup, slice of bread, drumstick, basket, food
  truck, shop front), a compact 11 × 13 set with 7 × 7 glyphs, the
  moderator's shield, the selection ring, the night glow, the contact
  shadows, the visitor's dot and its halo frames, and the placement ghost.
  Colours are the interface's: saffron `#f7a73b` with ink `#2e1602`
  (saffron and saffron-foreground), the Léman-blue shield, washed-out greys.
* **States.** Default; **verified** (a blue shield with a check on the
  top-right corner); **negative score** (washed out, slightly transparent,
  fainter glow); **hovered** (rises 5 px, 12 % brighter, name tag);
  **selected** (a white ring edged with faint ink so it reads on pale
  roofs, 12 % larger where the resolution allows, one 0.45 s hop when
  chosen, name tag). A stepped glow surrounds every badge: faint and white
  by day (it lifts badges off busy roofs), warm saffron at night. Reduced
  motion: no hop and no easing.
* **Two draw calls** whatever the number of spots (up to 1 000): contact
  shadows, then glows and badges
  ([`sprite-batch.ts`](../../apps/web/src/lib/world/sprite-batch.ts)). A
  vertex shader puts each quad in screen space at its projected anchor,
  snapped to the render-pixel grid; the fragment shader samples "sharp
  bilinear" (nearest inside a texel, a one-pixel blend at its edges), so
  the pixel art stays crisp at whole and fractional scales. The atlas holds
  premultiplied sRGB colours, decoded in the shader.
* **Constant size on screen**: 2 CSS px per texel up close (a 30 px
  badge), easing to 1.5 far away (23 px). Where render pixels are large (a
  1× screen, or a canvas drawn at a reduced pixel ratio and upscaled) a
  texel covers a whole number of them, and when that would make a full
  badge wider than 34 px (art pixels of 3 CSS px, or of 2 on a 125 %
  screen) the compact set takes over: badges stay 22–37 px wide at every
  art pixel size and screen density
  ([`marker-screen.ts`](../../apps/web/src/lib/world/marker-screen.ts)).
* **Occlusion: badges are always on top** of the city, drawn far to near,
  then the selected badge, then the hovered one, so a spot never vanishes
  behind a building in an oblique view and what is pointed at is never
  hidden. Their contact shadows are depth-tested (pulled 1.5 m plus 1 % of
  the distance towards the camera so they survive the voxel steps), so a
  shadow hidden behind a building tells that the spot's ground is not in
  view.
* **Heights.** A badge's tip sits on the surface currently drawn at its
  location (downward ray against the drawn tiles, measured again when the
  tile under it changes, so it follows the level of detail and stands on
  roofs), falling back to the stored elevation.
* **Laid out only when something changed**: camera matrices (projection
  included), canvas size, render scale, night, the spots, hover, selection,
  a height or a running animation. A still view costs nearly nothing;
  badges more than 80 px off screen are skipped and the draw order is
  sorted natively (depth and index packed in a `Float64Array`).
* **Name tags** for the hovered and the selected spot use drei's `<Html>`:
  a small pill (`bg-popover text-popover-foreground`, `text-xs`
  `font-medium`, truncated at 20 rem), `aria-hidden` (the panel and the
  list carry the name). They are **always mounted** and only their text
  changes: drei's `<Html>` owns a separate React root, and unmounting it
  during a render (React 19) caused `removeChild` errors and half-closed
  dialogs. They also get a fixed `portal`: without one, drei moves the tag
  to R3F's event element once events connect, and that move emptied the
  first tags (finding 121). The frame loop places them above their badge.
* **The visitor's position** after "Go to my location" (never sent
  anywhere): [`UserLocationMarker`](../../apps/web/src/components/world/UserLocationMarker.tsx)
  draws a blue pixel dot with a white ring and an 8-frame halo pulse (a
  still ring with reduced motion), the same way.

## Picking and placement

* **Badges are picked in screen space**: the shader draws them, so three's
  raycaster cannot. Each layout records every badge's rectangle on screen in
  drawing order, through the camera's projection (view offset included),
  and a pointer is tested front-most first, with a 2 px margin for a mouse
  and 10 px for a finger. Hover is tested every frame (badges move under a
  still mouse while the camera moves) and touch has no hover; a click is a
  press and release within 6 px; badges behind the camera or entirely off
  screen are ignored. Hovering from the map never undoes a hover set by the
  spots list.
* Clicking the ground during placement picks a world point with a BVH ray
  cast against the drawn tiles ([streaming](streaming-and-lod.md#7-markers-and-picking)).
* `PlacementPicker` shows a ghost badge (cream, with a saffron cross; it
  breathes, and holds still with reduced motion) on the surface under the
  pointer; "use map centre" casts a ray through the middle of the screen
  when it is pressed (the reported view can be 250 ms old), which is also
  what **Enter** does on the focused map.

## Life

[`Life`](../../apps/web/src/components/world/Life.tsx) makes the city feel
inhabited, true to the place and cheap: everything is instanced, about
seven draw calls in all, scaled to the quality preset, and never drawn over
the badges.

| Preset | Boats | Birds | Clouds |
| --- | --- | --- | --- |
| low (small phones, software rendering in CI) | steamers and Évian shuttles | none | none |
| medium | all, with wakes | 25 | 6 |
| high | all, with wakes | 42 | 9 |

* **Boats on their timetable**
  ([`boats.ts`](../../apps/web/src/lib/world/life/boats.ts),
  [`Boats`](../../apps/web/src/components/world/life/Boats.tsx)). From
  Ouchy: two shuttles on the Évian line (one leaves each shore about every
  35 minutes), a Belle Époque paddle steamer to Vevey along Lavaux and back,
  a steamer cruise towards Morges; four sailing boats and a motor boat in
  the bay. Each sails a closed loop smoothed with a periodic centripetal
  Catmull-Rom spline, stops at its berths with gentle starts and stops
  (0.05 m/s²) and a dwell, and turns smoothly (headings taken over ±12 m;
  at most about 4°/s). Positions come from the **wall clock**, so every
  visitor sees a boat at the same place. A test decodes the shipped lake
  (horizon and level-3 tiles) and checks that every hull stays over water
  all along every loop (finding 122). Voxel models: the steamer's white
  hull, saloons, paddle boxes, yellow funnel and Swiss flag; the shuttle's
  navy band; sails; navigation lights and lit windows at night. Wakes are
  Kelvin wedges (19.5°) that grow with speed. Boats grow with distance
  (sailing boats up to 3.2× beyond 350 m, ships up to 1.8× beyond 1.2 km) so
  they still read from the map's usual height.
* **Birds** ([`birds.ts`](../../apps/web/src/lib/world/life/birds.ts),
  [`Birds`](../../apps/web/src/components/world/life/Birds.tsx)): small
  flocks circling where birds are: pigeons over Montbenon, the cathedral,
  Mon-Repos, Milan and the Hermitage, gulls over the water at Ouchy and
  Vidy. They wander, bank into their turns and flap in the vertex shader
  (gulls mostly glide). Flocks are taken in a fixed order (Montbenon, Ouchy,
  the cathedral, Mon-Repos, Milan, Vidy, the Hermitage) until the budget is
  spent. Each bird is at least 13–16 px wide on screen, the height of the
  ground under a flock comes from the manifest (no ray casts, no BVH
  builds), and they go to roost at night. Not drawn with reduced motion.
* **Clouds** ([`clouds.ts`](../../apps/web/src/lib/world/life/clouds.ts),
  [`Clouds`](../../apps/web/src/components/world/life/Clouds.tsx)): a few
  voxel clouds (40 m voxels, bases 1.5–2 km up) drifting with a light wind
  on a 14 km tile that wraps around the camera, in one draw call (offsets in
  a uniform array). Transparency is an ordered 4 × 4 dither, so no sorting;
  they fade when the camera nears their base and towards the horizon, and
  their undersides catch the city's glow at night. With reduced motion they
  hold still.
* **Cost**: about 0.03–0.07 ms of script per frame on the high preset and
  under 0.01 ms on the low one (JIT-warm, 4-core machine); no allocation per
  frame; boats beyond 12 km and birds beyond 5 km are not drawn.

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
* **The pixel-art resolution is the main performance lever**: up close the
  canvas has 1/4 to 1/9 of the pixels it had at device ratio 1, without
  MSAA. Zoomed out it has one pixel per CSS pixel (device ratio 1) with 4×
  MSAA on medium and high, the cost of a plain antialiased canvas, while the
  coarsest tiles are drawn.
  Silhouettes and cloud shadows are off on the low preset. SwiftShader
  measurements are in [ADR 0026](../decisions/0026-pixel-art-rendering-and-real-sky.md).
* **Markers and life** add two draw calls for the badges (one more for the
  visitor's dot, two while placing a spot) and about seven for the life
  layer. Their frame callbacks are named functions (`markersFrame`,
  `boatsFrame`, `birdsFrame`, `cloudsFrame`, `lifeClock`, …) so they can be
  found in a performance profile.
* Everything heavy (network, inflate, meshopt decoding, de-interleaving) is
  in workers; the main thread only wraps transferred buffers into
  `BufferGeometry`.
