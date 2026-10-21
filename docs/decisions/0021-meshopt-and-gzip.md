# 0021. meshopt + gzip instead of Draco or CDN compression

Status: accepted · Date: 2026-10-21

## Context

Raw tiles total 2.9 GB for the municipality. Phones on mobile data must get
a first view in a few megabytes, and decoding must be fast enough to stream
continuously. Geometry must stay bit-exact (integer voxel positions,
colour bytes carrying shader classes).

## Decision

* **`KHR_meshopt_compression`** applied by the official `meshoptimizer`
  encoder (vertex codec on the interleaved 12-byte stream, index codec on
  triangles), accessors untouched.
* Followed by **gzip of the whole file**, stored that way on disk. The client
  recognises the gzip magic bytes and inflates with the native
  `DecompressionStream` in the worker.
* Result: **2 895 MB → 190 MB** for the municipality (×15.2), 157 → 11.1 MB
  for the Flon demo.

## Alternatives

* **Draco**: higher ratios on organic meshes, but lossy quantisation and
  vertex reordering, a large decoder (hundreds of kB of WebAssembly) and slow
  decoding; our data is already quantised integers, where meshopt's
  byte-oriented codecs shine.
* **Relying on CDN compression** (Brotli/gzip `Content-Encoding`): hosts
  compress only some content types and sizes, and each host needs its own
  configuration; pre-compressed files behave the same on Next.js, Cloudflare
  Pages or any static server.
* **Brotli inside the file**: better ratio, but browsers expose no Brotli
  decoder to JavaScript (`DecompressionStream` supports gzip and deflate), so
  it would need a WebAssembly decoder.

## Consequences

* The compressor (`bun run city:compress`) is a required build step, run by
  the `City tiles` workflow; it is idempotent and rewrites tile sizes in the
  manifest.
* Decoding cost is negligible next to the network; the meshopt WebAssembly
  module needs `'wasm-unsafe-eval'` in the CSP.
