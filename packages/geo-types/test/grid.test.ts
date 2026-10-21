import { describe, expect, it } from "vitest";
import {
  childrenOf,
  indexManifest,
  MANIFEST_FORMAT_VERSION,
  SUPPORTED_FORMAT_VERSIONS,
  lv95ToWorld,
  parentOf,
  parseManifest,
  parseTileKey,
  tileAtWorld,
  tileKey,
  tilePath,
  tileWorldBox,
  worldToLv95,
  type CityManifest,
} from "../src";

const origin = { easting: 2_538_000, northing: 1_152_000, elevation: 372 };

describe("world coordinates", () => {
  it("maps LV95 to a y-up, z-south frame and back", () => {
    const w = lv95ToWorld(origin, 2_537_834.4, 1_152_510.7, 489.2);
    expect(w.x).toBeCloseTo(-165.6, 6);
    expect(w.y).toBeCloseTo(117.2, 6);
    expect(w.z).toBeCloseTo(-510.7, 6);
    const back = worldToLv95(origin, w.x, w.y, w.z);
    expect(back.e).toBeCloseTo(2_537_834.4, 6);
    expect(back.n).toBeCloseTo(1_152_510.7, 6);
    expect(back.h).toBeCloseTo(489.2, 6);
  });
});

describe("tiles", () => {
  it("matches the python pipeline conventions", () => {
    expect(tilePath({ level: 0, i: -2, j: 4 })).toBe("lod0/-2_4.glb");
    expect(tileKey({ level: 3, i: -1, j: 0 })).toBe("3/-1/0");
    expect(parseTileKey("2/-3/5")).toEqual({ level: 2, i: -3, j: 5 });
    const kids = childrenOf({ level: 2, i: -3, j: 5 });
    expect(kids.map((k) => [k.i, k.j])).toEqual([
      [-6, 10],
      [-5, 10],
      [-6, 11],
      [-5, 11],
    ]);
    for (const k of kids) expect(parentOf(k)).toEqual({ level: 2, i: -3, j: 5 });
  });

  it("computes world boxes with north towards -z", () => {
    const b = tileWorldBox({ level: 3, i: 0, j: 0 }, 1024, 10, 50);
    expect(b).toEqual({ minX: 0, maxX: 1024, minZ: -1024, maxZ: -0, minY: 10, maxY: 50 });
    expect(tileAtWorld(0, 128, 130, -1)).toEqual({ level: 0, i: 1, j: 0 });
    expect(tileAtWorld(0, 128, -1, 1)).toEqual({ level: 0, i: -1, j: -1 });
  });

  it("indexes a manifest and flags refinable nodes", () => {
    const m = parseManifest({
      format: "geolausanne-voxel-city",
      formatVersion: 1,
      origin,
      rootLevel: 1,
      lods: [
        { level: 0, voxelSize: 1, tileSize: 128 },
        { level: 1, voxelSize: 2, tileSize: 256 },
      ],
      tiles: [
        [1, 0, 0, 0, 10, 100],
        [1, 1, 0, 0, 10, 100],
        [0, 0, 0, 0, 5, 50],
        [0, 1, 0, 0, 5, 50],
        [0, 0, 1, 0, 5, 0],
        [0, 1, 1, 0, 5, 50],
      ],
    } as unknown as CityManifest);
    const idx = indexManifest(m);
    expect(idx.roots).toHaveLength(2);
    expect(idx.byKey.get("1/0/0")?.refinable).toBe(true);
    expect(idx.byKey.get("1/1/0")?.refinable).toBe(false);
    expect(idx.byKey.get("0/0/1")?.empty).toBe(true);
    expect(idx.lod(1).tileSize).toBe(256);
  });

  it("rejects foreign manifests", () => {
    expect(() => parseManifest({ format: "other" })).toThrow();
    expect(() => parseManifest({ format: "geolausanne-voxel-city", formatVersion: 99 })).toThrow();
    expect(() => parseManifest({ format: "geolausanne-voxel-city", formatVersion: "2" })).toThrow();
  });

  it("reads both the first tile format and the current one", () => {
    const base = { format: "geolausanne-voxel-city", origin, rootLevel: 1, lods: [], tiles: [] };
    expect(MANIFEST_FORMAT_VERSION).toBe(2);
    for (const formatVersion of SUPPORTED_FORMAT_VERSIONS) {
      expect(parseManifest({ ...base, formatVersion }).formatVersion).toBe(formatVersion);
    }
    expect(SUPPORTED_FORMAT_VERSIONS).toContain(1);
  });
});
