# 0027. Spots as pixel badges, drawn over the city and picked in screen space

Status: accepted · Date: 2026-10-21

## Context

The owner found the spot markers "too big" and not nice: 3D pins (a stem
and a head, two instanced meshes) that bobbed and spun, never smaller than
3 m, so they covered whole buildings from up close and turned into blobs
from afar. The city was becoming a pixel-art diorama, and the markers had to
belong to it: small, crisp, readable at a glance (which kind of place, is
it verified, is it disputed), still clickable among hundreds, and as cheap
as before with up to 1 000 spots on software-rendered CI machines.

## Decision

* **Pixel-art badges** drawn in code into one atlas: a 15 × 18 rounded
  saffron badge with an 11 × 11 glyph per category and a pointer tip on the
  spot, a contact shadow, and the states as sprites (shield when verified,
  washed out when the score is negative, a white ring when selected, a night
  glow). An 11 × 13 compact set takes over where render pixels are so coarse
  that a full badge would pass 34 px.
* **Constant size on screen** (about 30 px, 23 px far away), each texel
  covering a whole number of render pixels where pixels are large, so the
  art stays crisp at 1×, at 2×, and in a canvas drawn at a reduced pixel
  ratio and upscaled.
* **Billboards placed by a vertex shader**, two instanced draw calls for
  every spot (shadows; glows and badges), no DOM per spot.
* **Always on top**: badges ignore the depth buffer and are drawn far to
  near, the selected and the hovered badge last. Only the contact shadow is
  depth-tested, so it disappears when the spot's ground is hidden.
* **Screen-space picking**: every layout records the rectangle each badge
  covers on screen, in drawing order; a pointer is tested front-most first
  with a small margin (2 px mouse, 10 px touch), through the camera's
  projection, view offset included.

## Alternatives

* **Smaller 3D pins**: still perspective-scaled (huge up close, specks far
  away) and still a mesh among meshes; they clash with pixel art.
* **Depth-tested badges**: honest about occlusion but a spot in a street
  behind a building simply vanishes in the oblique views people use most.
* **Fading occluded badges** with a depth-texture lookup or a ray per badge:
  a depth pre-pass costs a full extra render (too much on CI's software
  renderer and small phones); 1 000 rays per frame against the tile BVHs
  cost more than the whole marker layer and build BVHs on the way.
* **DOM markers** (one element per spot over the canvas): easy picking and
  styling, but hundreds of elements moved every frame, layout and paint
  costs, and focusable elements that would duplicate the spots list
  ([ADR 0015](0015-accessible-3d-map.md) already chose the list as the
  accessible path).
* **`THREE.Sprite` or `Points`**: sprites cost one draw call each; points
  cannot carry a pivot (the tip) or per-instance atlas rectangles, and
  their maximum size varies by GPU.
* **Raycasting the instanced quads**: the quads only exist in the shader;
  rebuilding them on the CPU every frame for the raycaster would cost more
  than testing rectangles.

## Consequences

* Badges stay readable and small from street level to the whole city, and
  a spot is never hidden; the contact shadow carries the depth cue.
* Picking is exact for what is drawn, costs nothing extra (the rectangles
  come from the layout) and follows the view offset of the side panels.
* A badge can show a spot that is behind a building; the shadow and the
  tip make it clear where the spot is, and the name tag and panel confirm
  it.
* The layout runs on the main thread: about 0.4 ms with 1 000 spots while
  the camera moves (like the old pins), nearly nothing while it is still.
* New categories need a glyph in both sizes (the atlas test checks that
  every category has two distinct glyphs).
