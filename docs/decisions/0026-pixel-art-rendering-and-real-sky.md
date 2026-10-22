# 0026. Pixel-art rendering under Lausanne's real sky

Status: accepted · Date: 2026-10-21

## Context

The voxel city was rendered like a smooth 3D scene at full resolution with
MSAA, under one fixed afternoon light. The owner asked for it to "actually
look pixel-art voxelized" and to feel alive. Constraints: phones must stay
smooth, and the CI renders the city on SwiftShader (a CPU WebGL) with two
cores and gives the first view at most 60 seconds.

## Decision

* **Low internal resolution, crisp upscaling.** One rendered pixel covers
  1.5–3 CSS pixels (`QUALITY[*].pixelSize`: 2 on wide screens, 1.5 on narrow
  ones, 3/2 on the low preset), always a whole number of device pixels
  (`artPixelRatio`), and the browser scales the canvas up with
  `image-rendering: pixelated`. No MSAA anywhere.
* **One pass at that resolution** (`components/world/PixelArt.tsx`) fills
  pinholes and, on the medium and high presets, draws 1-pixel dark outlines
  where the depth jumps, fading out with distance.
* **Light like hand-made pixel art.** Vertex colours are sRGB albedos,
  linearised in the shader; a warm sun and a cool hemisphere light are tuned
  so that tops get ~0.8–1.0 of their albedo, sunlit walls ~0.8–1.1 (golden
  at low sun) and shaded walls ~0.45 with a blue cast; occlusion darkens
  towards blue-grey. No tone mapping.
* **Lausanne's real sky.** In day mode the sun stands where it stands over
  Lausanne at that minute (NOAA solar position), clamped to daylight: at
  night the scene shows the evening light, before dawn the morning light.
  Morning is cooler and pinker, noon neutral, evening golden; the sky is a
  banded, dithered gradient with a crisp sun disc. Night mode (dark theme) is
  moonlit, with lit windows, sodium-lit streets and glowing pools. Autumn
  colours a share of broadleaf crowns by date; cloud shadows drift on the
  medium and high presets.
* **Reduced motion keeps everything still**: the shared clock stops (water,
  clouds, sway), day/night switches at once; the light still follows the
  clock, in one-minute steps without animation.

## Alternatives

* **Pixelating with a CSS filter or a full-resolution post pass**: the GPU
  would still render every pixel. Rendering fewer pixels is what makes the
  look cheap (see the measurements below).
* **A pixel size that follows the zoom**: every threshold crossing would
  resize the canvas and the pixels would visibly pop; a fixed size per
  preset and screen width reads as a deliberate style.
* **Normal-based crease lines**: three.js materials do not write a normal
  target (multiple render targets), and depth jumps already carry the
  silhouettes that matter.
* **Shadow maps for the sun**: the most convincing depth cue, but a second
  render of every tile (millions of triangles) — out of reach of phones and
  of the CI. Baked occlusion plus outlines carry the depth for now; real
  shadows could be added to the high preset later.
* **Tone mapping (ACES, AgX)**: compresses and desaturates the palette;
  pixel art wants the palette as chosen.

## Consequences

* Measured on the Flon demo with SwiftShader (the CI's software renderer),
  dev server, home view, the previous code and tiles against these, on the
  same machine under similar load (4 shared cores, load average 6–10):

  | Run | First view | Median frame |
  | --- | --- | --- |
  | desktop, low preset | 43.6 → 34.5 s | 2.18 → 1.92 s |
  | desktop, medium preset (ends on low) | 72.9 → 51.2 s | 5.78 → 1.92 s |
  | desktop, high preset (ends on medium) | 92.3 → 49.9 s | 11.08 → 2.45 s |
  | desktop, low, 2 cores (like the CI) | 38.8 → 35.7 s | 2.73 → 1.88 s |
  | phone, low preset | 22.1 → 23.5 s | 1.05 → 1.15 s |

  The canvas has 1/4 (medium, high) to 1/9 (low) of the pixels it had at a
  device pixel ratio of 1, and no MSAA, while the tiles carry 21 % more
  quads (colours and occlusion): desktop frames are 1.1 to 4.5 times
  faster; the phone's low preset, already small, stays level (vertex work
  rather than pixels seems to dominate there). On real GPUs the saving is fill rate, largest on
  high-density phone screens: a 390 × 844 phone at ratio 3 used to render
  1.5 to 2 times its CSS size with MSAA (medium, high presets), now 0.6
  times without.

* T-junctions of greedy meshing open sub-pixel cracks; at low resolution
  each is a visible pixel of sky, so the pass fills pinholes (about 0.2 % of
  the pixels on SwiftShader).
* Procedural detail (windows, ground patterns) is tied to the rendered pixel
  size: it fades to its average below 2–4 pixels instead of shimmering.
* Picking and name tags work in CSS coordinates and are unaffected; pins
  are drawn at the low resolution like the city.
* Screenshots and tests can pin the light with `setSunTime` on the world
  store (the `?debug` handle); Playwright's clock cannot be used, it freezes
  `performance.now()`.

## Update (2026-10-22): pixels and fog follow the zoom

The owner found the zoomed-out city "too pixelized, not smooth at all". At a
fixed 2 CSS pixels per rendered pixel, the far view of the agglomeration
(8 m voxels about one pixel wide) sampled one voxel per 2 × 2 block: grainy
noise. The fixed fog (2.2 to 17 km) hid most of the city once the camera was
9 km away, in the warm haze of the horizon colour.

* Pixels keep their size up to an orbit distance of 1.2 km (the home view,
  1.45 km, is unchanged on every screen), then shrink to 1 CSS pixel by
  3.2 km (1.5 on the low preset), in whole device pixels with a hysteresis.
* At that far size the medium and high presets antialias the frame with 4×
  MSAA in the frame pass's render target. Large pixels stay unsmoothed: the
  canvas itself never has MSAA.
* The fog starts at 1.5 × the orbit distance (never closer than 2.2 km).

Cost: zoomed out, the canvas has one pixel per CSS pixel at device ratio 1
with 4× MSAA, what a plain antialiased canvas costs, while only the
coarsest tiles are drawn; up close nothing changes. Alternatives considered:
a continuous resolution (a resize on every zoom step, and pixel sizes that
are not whole device pixels look uneven), bilinear upscaling at the far
size (softens the whole frame on high-density screens) and a coarser level
of detail for the far view (averaged colours, but a pipeline and format
change for a problem the renderer can solve).
