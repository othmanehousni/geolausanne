# 0020. Our own tile decoder in a worker pool instead of GLTFLoader

Status: accepted · Date: 2026-10-21

## Context

The blueprint suggested three.js's `GLTFLoader`. A city view loads 70–150
tiles at once and keeps streaming while the camera moves; any main-thread work
per tile shows up as dropped frames. `GLTFLoader` parses on the main thread
(JSON, accessors, materials, scene graph) and would build materials and
meshes we immediately replace with ours.

## Decision

* The pipeline writes a **small, fixed glTF subset** ([tile format](../pipeline/tile-format.md)).
* A **pool of module workers** (`min(3, cores − 2)`) does everything heavy per
  tile: `fetch` with cancellation, gunzip (`DecompressionStream`), meshopt
  decoding (three's `MeshoptDecoder`, WebAssembly), parsing the GLB, and
  de-interleaving into exactly the typed arrays the GPU needs.
* Buffers are **transferred** (zero-copy) to the main thread, which only wraps
  them in `BufferGeometry` and shared materials.
* The decoder **rejects** anything outside the subset with an explicit error.

## Alternatives

* `GLTFLoader` (+ `MeshoptDecoder.useWorkers`): decoding moves off-thread but
  parsing and object creation stay on the main thread, plus a generic scene
  graph to traverse and patch per tile.
* `useGLTF` from drei: same loader, plus Suspense semantics that do not fit
  incremental streaming with priorities and cancellation.

## Consequences

* The tile format is a contract shared by `export.py`, the compressor and
  `tile-format.ts`; a unit test decodes a real compressed tile produced by
  the pipeline (`__tests__/fixtures/lod0_-6_-2.glb`).
* Tiles still open in any glTF viewer for debugging.
