# Streaming and level of detail

Code: [`lib/world/lod.ts`](../../apps/web/src/lib/world/lod.ts) (pure, unit
tested), [`lib/world/tile-store.ts`](../../apps/web/src/lib/world/tile-store.ts),
[`lib/world/tile.worker.ts`](../../apps/web/src/lib/world/tile.worker.ts),
[`components/world/CityTiles.tsx`](../../apps/web/src/components/world/CityTiles.tsx).

This implements the blueprint's "World Manager": determine what is visible,
choose a level per area, fetch with a concurrency limit, replace parents when
children are ready, evict what is no longer needed, and keep "cached" and
"drawn" as different states.

## 1. Index

The manifest's compact tile rows become a `TileIndex`: a map from
`level/i/j` to tile info (vertical extent, size, `empty`) plus `refinable`
(all four children exist). Roots are the level-3 tiles.

## 2. Selection, every frame

`selectTiles` walks the quadtree from each root:

1. **Frustum culling** on the tile's world box (vertical extent from the
   manifest, padded by −2/+30 m for markers and trees).
2. **Screen-space error.** The size in pixels of one voxel of the tile, seen
   from the camera's distance to the box:

   ```
   px = voxelSize · (viewportHeight / (2 · tan(fov / 2))) / distance
   ```

   A tile is **refined** when `px > maxVoxelPx` (2.0 / 2.8 / 4.0 px for high /
   medium / low quality). This is what the blueprint asked for: projected
   screen-space error, not raw distance, so a tall viewport or a narrow field
   of view refines more.
3. **Hysteresis.** A node that was refined in the previous frame only
   coarsens again below `maxVoxelPx × 0.72`, so hovering on a boundary never
   makes tiles flicker between levels.
4. **No holes.** A refined node is replaced by its children only when **all
   four are ready**; until then the parent keeps drawing and the children are
   requested urgently (priority = projected size). Children swap in within
   one frame. A root that is not loaded (never yet, or evicted during a long
   visit at street level) draws whatever is loaded below it meanwhile,
   finer than needed, rather than nothing.
5. **Prefetch.** When `px > maxVoxelPx × 0.7` the children are requested at a
   quarter of the priority, so they are often ready by the time they are
   needed.
6. **Roots first.** A root that is not loaded gets priority 1 000 000 + px:
   nothing is drawn there yet, so it outranks every refinement.

The camera matrix is updated before the frustum is built, so culling never
lags a frame behind a rotation. Keys, boxes and children are computed once
per index, not per frame (selection takes about 0.075 ms at the home view).

The result is the list of tiles to draw (all ready), the requests sorted by
priority, and the set of refined nodes (fed back for hysteresis).

## 3. Loading: `TileStore`

* **Worker pool**: `min(3, max(1, cores − 2))` module workers. Each request is
  `fetch` → gunzip (`DecompressionStream`) → meshopt decode
  (`MeshoptDecoder`, WebAssembly) → de-interleave into `Int16Array`
  positions, `Uint8Array` colours and index arrays → transferred (zero-copy)
  to the main thread, which only builds `BufferGeometry` objects. Parsing our
  own small glTF subset is much cheaper than a generic loader
  ([ADR 0020](../decisions/0020-own-tile-decoder-in-workers.md)).
* **Concurrency**: at most 4 / 6 / 8 loads in flight (low / medium / high);
  a new load goes to the least busy worker.
* **Cancellation**: a load nobody asked for in the last 1.5 s (the camera
  moved on) is aborted with `AbortController`; a failed tile nobody wants
  any more is forgotten, so it starts afresh when wanted again.
* **Retries**: a failed tile is retried after 2, 4, 8 and 30 s, then every
  minute for as long as it is wanted, without blocking the others. When the
  browser comes back online, or the visitor presses "Try again" on the
  notice that appears after 3 s of failures, every failed tile is retried at
  once. Failed tiles never hold back the first view.
* **Stalls**: a worker aborts a download that receives no data for 20 s (a
  slow but steady one goes on, reporting progress every 5 s: a total time
  limit would fail the 1.4 MB horizon on 2G forever). The main thread gives
  each load 30 s, extended by progress; a worker that errors, sends an
  unreadable message or stays silent past that is terminated and replaced,
  and its loads are retried. A worker that keeps failing before its first
  answer is replaced less and less often.
* **URLs**: `<CITY_BASE_URL>/lod<l>/<i>_<j>.glb?v=<manifest version>`; the
  version makes tiles immutable and cacheable for a year.

## 4. Cache and eviction

Loaded tiles stay on the GPU while invisible ("cached"), so panning back is
instant. Each tile's GPU size is known exactly (positions + colours +
indices + 64 bytes per tree instance). When the total exceeds the budget
(120 / 220 / 400 MB), the least recently *drawn* invisible tiles are disposed
until the total is back under 85 % of the budget. Drawn tiles are never
evicted, and neither are the nodes the current view refines through nor
their children (a refined node needs all four, and the siblings of drawn
tiles just outside the frustum return on the smallest turn).

## 5. Quality presets

[`lib/world/config.ts`](../../apps/web/src/lib/world/config.ts):

| Preset | Refine above | Pixel ratio | GPU budget | Loads in flight | MSAA |
| --- | --- | --- | --- | --- | --- |
| low | 4.0 px | 0.75–1 | 120 MB | 4 | off |
| medium | 2.8 px | 1–1.5 | 220 MB | 6 | on |
| high | 2.0 px | 1–2 | 400 MB | 8 | on |

`detectQuality()` picks **low** with ≤ 3 GB of memory or ≤ 4 cores,
**medium** on touch devices or ≤ 6 GB, else **high**. drei's
`PerformanceMonitor` steps down one preset when the frame rate keeps
declining. A step changes the pixel ratio, the refinement threshold, the
budget and the concurrency **in place** (`TileStore.setLimits`): the tiles
already loaded stay, nothing is downloaded again. (MSAA is fixed when the
WebGL context is created.)

## 6. Measured first view

Home view of the whole municipality (build `0d885f38502f`), production build,
until no tile request for 4 s. Measured with
Playwright by counting tile responses and decoding the same tiles with the
app's decoder:

| Device profile | Tiles (L3 / L2 / L1 / L0) | Downloaded | GPU geometry | Budget |
| --- | --- | --- | --- | --- |
| desktop 1440 × 900, high | 144 (26 / 56 / 52 / 10) | 10.3 MB + 1.8 MB manifest and horizon | 107 MB | 400 MB |
| phone 412 × 915, 6 GB, medium | 102 (12 / 40 / 36 / 14) | 6.9 MB + 1.8 MB | 71 MB | 220 MB |
| phone 412 × 915, 3 GB / 4 cores, low | 72 (12 / 36 / 24 / 0) | 5.4 MB + 1.8 MB | 56 MB | 120 MB |

All three stay inside the blueprint's 150–250 MB GPU target. Frame rates
could not be measured here (the test machine renders with SwiftShader, a CPU
WebGL implementation); see [performance](../operations/performance.md) for
the procedure on real hardware.

## 7. Markers and picking

* Places are fetched for a square around the camera target whose half-size is
  the camera distance × 1.4, **quantised to powers of two** (600 m … 7 km), so
  small camera moves reuse the same query key instead of refetching.
* Ray casts (tap on the map, placement, marker heights) use `three-mesh-bvh`; the
  BVH of a tile mesh is built lazily, the first time a ray actually reaches it
  (`firstHitOnly`). Meshes are tested against their world box first and
  nearest first, and skipped once they cannot beat the best hit. Building
  one BVH takes 5–40 ms, so probes that can wait (pin heights, the ground
  under the camera, hover) build about one per frame and otherwise try again
  next frame; clicks and one-off picks never wait. Only drawn tiles are
  tested, except for `groundHeightAt`, which also uses cached tiles.
* A pin is measured again whenever the tile drawn under it changes (a finer
  level arrives, or it is no longer drawn), in round-robin order with a
  budget per frame; pins with nothing drawn below them cost nothing.
* `groundHeightAt(x, z)` gives the ground where nothing may be drawn yet
  (flights, "use my location"): the finest loaded tile at that point, else
  the finest manifest tile's `minY + 0.4 × (maxY − minY)` (measured on the
  real level-0 tiles: about ±8 m), else the current target. At the end of a
  flight the camera measures again and glides onto the drawn surface.

## Tests

[`lib/world/__tests__/lod.test.ts`](../../apps/web/src/lib/world/__tests__/lod.test.ts)
checks refinement order, hysteresis, the "all four children" rule, prefetch
and the no-hole fallback; [`tile-store.test.ts`](../../apps/web/src/lib/world/__tests__/tile-store.test.ts)
the retry schedule, stalls, worker replacement and eviction;
[`picking.test.ts`](../../apps/web/src/lib/world/__tests__/picking.test.ts),
[`navigation.test.ts`](../../apps/web/src/lib/world/__tests__/navigation.test.ts)
and [`CityTiles.test.tsx`](../../apps/web/src/components/world/__tests__/CityTiles.test.tsx)
the pacing, the ground fallback and the frame loop;
[`tile-format.test.ts`](../../apps/web/src/lib/world/__tests__/tile-format.test.ts)
decodes a real compressed tile fixture.
