// @vitest-environment node
import { describe, expect, it } from "vitest";
import { indexManifest, parseManifest, tileKey, type CityManifest, type TileRow } from "@geolausanne/geo-types";
import { DEFAULT_LOD_OPTIONS, distanceToBox, projectedVoxelPx, selectTiles, type LodCamera } from "../lod";

/** Two-level synthetic city: one 256 m root with four 128 m children. */
function makeIndex(childBytes = 100) {
  const tiles: TileRow[] = [
    [1, 0, 0, 0, 20, 500],
    [0, 0, 0, 0, 10, childBytes],
    [0, 1, 0, 0, 10, childBytes],
    [0, 0, 1, 0, 10, childBytes],
    [0, 1, 1, 0, 10, 0],
  ];
  return indexManifest(
    parseManifest({
      format: "geolausanne-voxel-city",
      formatVersion: 1,
      origin: { easting: 0, northing: 0, elevation: 0 },
      rootLevel: 1,
      lods: [
        { level: 0, voxelSize: 1, tileSize: 128 },
        { level: 1, voxelSize: 2, tileSize: 256 },
      ],
      tiles,
    } as unknown as CityManifest),
  );
}

const camAt = (x: number, y: number, z: number): LodCamera => ({ x, y, z, fov: Math.PI / 3, viewportHeight: 1000 });
const all = () => true;

describe("projected voxel size", () => {
  it("halves when the distance doubles", () => {
    const c = camAt(0, 0, 0);
    expect(projectedVoxelPx(1, 100, c) / projectedVoxelPx(1, 200, c)).toBeCloseTo(2, 6);
  });
  it("is zero distance inside a box", () => {
    expect(distanceToBox({ x: 5, y: 5, z: -5 }, { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: -10, maxZ: 0 })).toBe(0);
  });
});

describe("selectTiles", () => {
  it("requests the root first when nothing is loaded", () => {
    const idx = makeIndex();
    const r = selectTiles(idx, camAt(128, 50, -128), all, () => false, new Set());
    expect(r.render).toHaveLength(0);
    expect(r.requests[0]?.key).toBe("1/0/0");
  });

  it("keeps drawing the parent until every child is ready", () => {
    const idx = makeIndex();
    const loaded = new Set(["1/0/0", "0/0/0", "0/1/0"]);
    const r = selectTiles(idx, camAt(128, 30, -128), all, (k) => loaded.has(k), new Set());
    expect(r.render.map(tileKey)).toEqual(["1/0/0"]);
    expect(r.requests.map((q) => q.key)).toContain("0/0/1");
    // the empty child never needs loading
    expect(r.requests.map((q) => q.key)).not.toContain("0/1/1");
  });

  it("swaps to the children once they are all ready", () => {
    const idx = makeIndex();
    const loaded = new Set(["1/0/0", "0/0/0", "0/1/0", "0/0/1"]);
    const r = selectTiles(idx, camAt(128, 30, -128), all, (k) => loaded.has(k), new Set());
    expect(r.render.map(tileKey).sort()).toEqual(["0/0/0", "0/0/1", "0/1/0"]);
    expect(r.refined.has("1/0/0")).toBe(true);
  });

  it("stays coarse when far away", () => {
    const idx = makeIndex();
    const loaded = new Set(["1/0/0", "0/0/0", "0/1/0", "0/0/1"]);
    const r = selectTiles(idx, camAt(128, 5000, -128), all, (k) => loaded.has(k), new Set());
    expect(r.render.map(tileKey)).toEqual(["1/0/0"]);
  });

  it("applies hysteresis to refined nodes", () => {
    const idx = makeIndex();
    const loaded = new Set(["1/0/0", "0/0/0", "0/1/0", "0/0/1"]);
    const isReady = (k: string) => loaded.has(k);
    // find a height where the root's voxels are just under the refine threshold
    const lod1 = idx.lod(1);
    const cam = camAt(128, 0, -128);
    let h = 10;
    while (projectedVoxelPx(lod1.voxelSize, h - 20, cam) > DEFAULT_LOD_OPTIONS.maxVoxelPx * 0.9) h += 1;
    const c = camAt(128, h, -128);
    const fresh = selectTiles(idx, c, all, isReady, new Set());
    const sticky = selectTiles(idx, c, all, isReady, new Set(["1/0/0"]));
    expect(fresh.render.map(tileKey)).toEqual(["1/0/0"]);
    expect(sticky.render).toHaveLength(3);
  });

  it("skips tiles outside the frustum", () => {
    const idx = makeIndex();
    const r = selectTiles(idx, camAt(128, 30, -128), () => false, () => true, new Set());
    expect(r.render).toHaveLength(0);
    expect(r.requests).toHaveLength(0);
  });
});
