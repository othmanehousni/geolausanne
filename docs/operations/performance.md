# Performance

Targets from the blueprint: 60 FPS on a decent desktop, 30 FPS on a mid-range
phone, a GPU memory budget of roughly 150–250 MB for the loaded world.

## Data sizes

Municipality build `0d885f38502f` (21 October 2026):

| Level | Voxel | Tiles | Served | Quads | Notes |
| --- | --- | --- | --- | --- | --- |
| 0 | 1 m | 4 096 | 80.0 MB | 15.3 M | + 221 656 instanced trees |
| 1 | 2 m | 1 196 | 59.2 MB | 16.3 M | |
| 2 | 4 m | 952 | 38.7 MB | 9.0 M | |
| 3 | 8 m | 238 | 10.5 MB | 2.2 M | roots |
| horizon | 32/128 m | 1 file | 1.4 MB | 0.5 M | |
| **total** | | 6 483 files | **189.9 MB** (2 895 MB raw) | 42.7 M + horizon | largest tile 110 KB |

The manifest is 350 KB of JSON (served compressed).

## First view, measured

Home view, production build, until no tile request for 4 s; downloaded bytes
counted from responses, GPU geometry computed by decoding the same tiles with
the app's decoder. Quality forced through `navigator.deviceMemory` and
`hardwareConcurrency`, exactly as `detectQuality()` reads them.

| Profile | Tiles (L3/L2/L1/L0) | Tiles downloaded | + manifest & horizon | GPU geometry | Budget |
| --- | --- | --- | --- | --- | --- |
| desktop 1440 × 900, high | 144 (26/56/52/10) | 10.3 MB | 1.8 MB | 107 MB | 400 MB |
| phone 412 × 915 @2.6, 6 GB / 8 cores, medium | 102 (12/40/36/14) | 6.9 MB | 1.8 MB | 71 MB | 220 MB |
| phone 412 × 915 @2.6, 3 GB / 4 cores, low | 72 (12/36/24/0) | 5.4 MB | 1.8 MB | 56 MB | 120 MB |

GPU geometry stays well inside the blueprint's 150–250 MB on every profile.
The budgets are ceilings for the *cache* (tiles kept after they leave the
view), reached only after long exploration; eviction then frees the least
recently drawn tiles.

## Page weight

Map page, desktop, production build (Flon demo tiles), compressed transfer:

| Resource | Requests | Size |
| --- | --- | --- |
| HTML | 1 | 14 KB |
| JavaScript (app, React, Next.js, Base UI, three.js, R3F, drei, supabase-js…) | 20 | 713 KB |
| CSS | 2 | 25 KB |
| Fonts (Atkinson Hyperlegible Next, Pixelify Sans) | 3 | 60 KB |
| City manifest (Flon) | 1 | 3 KB |
| City tiles (Flon first view) | 73 | 7.1 MB |

The 3D engine is a separate chunk loaded with `next/dynamic` after the
overlay is interactive, so search, the spots list and the panels work before
three.js arrives. Pages themselves are static HTML from the CDN.

## Frame rate

Not measurable in the build environment: there is no GPU, and Chromium
renders WebGL on the CPU with SwiftShader (first views took 11–170 s there,
which says nothing about real devices). How to measure on hardware:

1. Production build pointing at the full city
   (`NEXT_PUBLIC_CITY_BASE_URL=…/city/lausanne bun run build && bun run start`).
2. Chrome DevTools → Performance (or `chrome://tracing`), record 20 s of
   panning and zooming over the centre; read FPS and long tasks. On phones use
   remote debugging (Android) or Safari's Web Inspector (iOS).
3. Open the page with `?debug` (e.g. `/en?debug`): the console then has
   `geolausanne.world.getState()` with `firstViewReady`, `quality`,
   `pixelStyle` and the tile statistics (`stats`: cached, drawn, loading,
   GPU bytes, downloaded bytes). Add `&quality=low|medium|high` to pin a
   preset: the frame-rate monitor then never steps it down, so the numbers
   belong to that preset.
4. Note the device, the browser, the quality preset and the city pixels
   (account menu: large, fine, sharp).

## Levers

| Lever | Where | Effect |
| --- | --- | --- |
| Quality presets (pixel ratio, refinement threshold, budget, concurrency, MSAA) | `lib/world/config.ts` | the main knob; auto-detected, stepped down by `PerformanceMonitor` without reloading tiles |
| City pixels (large, fine, sharp) | account menu, `PixelStyle` in `lib/world/config.ts` | the visitor's choice of resolution: fine renders 4× the pixels of large up close (one per CSS pixel, 4× MSAA) and refines tiles sooner; sharp up to 4× more again on high-density screens; the presets' step-down still applies |
| Refinement threshold (`maxVoxelPx`) | presets | a 40 % higher threshold roughly halves the tiles in view |
| Hysteresis / prefetch factors | `CityTiles.tsx` (0.72 / 0.7) | less popping vs fewer requests |
| On-demand rendering behind modals | `useCoverMap` + `Pacing` | no rendering while a dialog covers the map |
| Instanced badges, boats, birds, clouds and trees | `PlaceMarkers.tsx`, `Life.tsx`, level-0 tiles | two draw calls for every badge, about seven for the life layer, one per tree prefab |
| Marker layout on change only | `PlaceMarkers.tsx` | a still view costs nearly nothing; 0.4 ms with 1 000 spots while the camera moves |
| Life budget per preset | `lib/world/life/budget.ts` | the low preset keeps only the big boats (no birds, clouds, small boats or wakes) |
| Lazy BVH | `picking.ts` | ray-cast acceleration built only for meshes a ray reaches |
| Worker decoding, transfer of buffers | `tile.worker.ts` | no parsing on the main thread |
| Static pages, self-hosted fonts, deferred 3D chunk | Next.js config and `WorldCanvas` | fast first paint |
| Tile size (128 voxels) and levels | pipeline `config.py` | changing them changes the whole format; avoid |

## Server side

There is none in the hot path: pages are static, tiles are static, and the
database answers small RPCs (`places_in_bbox` returns at most 400 rows per
quantised area, and the area key changes only in powers of two as the camera
moves).
