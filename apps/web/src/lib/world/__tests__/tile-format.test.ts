// @vitest-environment node
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { decodeTileGlb, isGzip } from "../tile-format";

const fixture = readFileSync(new URL("./fixtures/lod0_-6_-2.glb", import.meta.url));

function toArrayBuffer(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("decodeTileGlb", () => {
  it("decodes a real gzip + meshopt compressed LOD 0 tile from the pipeline", async () => {
    const raw = toArrayBuffer(fixture);
    expect(isGzip(raw)).toBe(true);
    const glb = toArrayBuffer(gunzipSync(fixture));
    await MeshoptDecoder.ready;
    const tile = decodeTileGlb(glb, MeshoptDecoder);
    expect(tile.scale).toBe(1);
    expect(tile.translation).toEqual([-768, 0, 128]);
    expect(tile.primitives.length).toBeGreaterThanOrEqual(1);
    for (const p of tile.primitives) {
      expect(p.positions.length % 3).toBe(0);
      expect(p.colors.length / 4).toBe(p.positions.length / 3);
      expect(p.indices.length % 6).toBe(0);
      // every index points at a vertex
      let max = 0;
      for (const i of p.indices) max = Math.max(max, i);
      expect(max).toBeLessThan(p.positions.length / 3);
      // positions lie on the voxel lattice inside the tile footprint
      for (let k = 0; k < p.positions.length; k += 3) {
        expect(p.positions[k]).toBeGreaterThanOrEqual(0);
        expect(p.positions[k]).toBeLessThanOrEqual(128);
        expect(p.positions[k + 2]).toBeGreaterThanOrEqual(0);
        expect(p.positions[k + 2]).toBeLessThanOrEqual(128);
      }
    }
    expect(tile.gpuBytes).toBeGreaterThan(0);
  });
});
