// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { decodeSceneGlb, decodeTileGlb, isGzip, type DecodedPrimitive } from "../../tile-format";
import { BOAT_SIZE, boatAt, LAKE_ROUTES, legDistance, legDuration, voyage } from "../boats";
import { pointAt, wrapAngle } from "../paths";

describe("timetable maths", () => {
  it("starts and stops gently, cruising in between", () => {
    const L = 5000;
    const v = 7;
    const T = legDuration(L, v);
    expect(legDistance(0, L, v)).toBe(0);
    expect(legDistance(T, L, v)).toBeCloseTo(L, 6);
    let prev = 0;
    let top = 0;
    for (let t = 1; t <= T; t += 1) {
      const s = legDistance(t, L, v);
      expect(s).toBeGreaterThanOrEqual(prev);
      top = Math.max(top, s - prev);
      prev = s;
    }
    expect(top).toBeCloseTo(v, 1);
    // about half a kilometre to reach cruising speed
    expect(legDistance(v / 0.05, L, v)).toBeCloseTo((v * v) / 0.1, 3);
  });

  it("never reaches cruising speed on a short leg, and still arrives", () => {
    const T = legDuration(200, 7);
    expect(legDistance(T, 200, 7)).toBeCloseTo(200, 6);
    expect(legDistance(T / 2, 200, 7)).toBeCloseTo(100, 6);
  });
});

describe("boats on their loops", () => {
  const voyages = LAKE_ROUTES.map(voyage);

  it("moor at each stop for the dwell time, then leave forwards", () => {
    for (const v of voyages.filter((x) => x.stopsAt.length > 0)) {
      const start = boatAt(v, -v.route.offset);
      const berth = v.route.points[0]!;
      expect(Math.hypot(start.x - berth.x, start.z - berth.z)).toBeLessThan(15);
      expect(start.speed).toBe(0);
      const still = boatAt(v, -v.route.offset + v.route.dwell - 1);
      expect(Math.hypot(still.x - start.x, still.z - start.z)).toBeLessThan(0.01);
      const off = boatAt(v, -v.route.offset + v.route.dwell + 60);
      expect(off.speed).toBeGreaterThan(0);
      // forwards: the heading does not flip when leaving
      expect(Math.abs(wrapAngle(off.heading - start.heading))).toBeLessThan(Math.PI / 2);
    }
  });

  it("move smoothly and repeat every round", () => {
    for (const v of voyages) {
      let prev = boatAt(v, 0);
      for (let t = 2; t <= v.period; t += 2) {
        const b = boatAt(v, t);
        // no jumps: never faster than the cruising speed (a little slack for curves)
        expect(Math.hypot(b.x - prev.x, b.z - prev.z)).toBeLessThanOrEqual(2 * v.route.speed * 1.01 + 0.01);
        // no spins: big boats turn at most ~6°/s
        if (v.route.kind === "steamer" || v.route.kind === "shuttle") expect(Math.abs(wrapAngle(b.heading - prev.heading))).toBeLessThan(0.2);
        prev = b;
      }
      const a = boatAt(v, 1234);
      const b = boatAt(v, 1234 + v.period);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
    }
  });

  it("run the Évian line both ways: one shuttle at each shore at a time", () => {
    const [a, b] = voyages.filter((v) => v.route.id.startsWith("evian"));
    for (let t = 0; t < a!.period; t += 30) {
      const pa = boatAt(a!, t);
      const pb = boatAt(b!, t);
      // never both moored at Ouchy
      expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeGreaterThan(100);
    }
  });
});

/**
 * The lake as the shipped city draws it: water cells (shader class 128, at
 * world y = 0) of the Flon demo's horizon and root tiles, on a 16 m grid.
 */
const CITY = new URL("../../../../../public/city/flon/", import.meta.url);
const hasCity = existsSync(new URL("horizon.glb", CITY));

describe.runIf(hasCity)("boat routes against the lake of the terrain model", () => {
  it("keep every hull over water, all along every loop", async () => {
    await MeshoptDecoder.ready;
    const load = (url: URL) => {
      const b = readFileSync(url);
      const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      if (!isGzip(ab)) return ab;
      const g = gunzipSync(b);
      return g.buffer.slice(g.byteOffset, g.byteOffset + g.byteLength) as ArrayBuffer;
    };
    const CELL = 16;
    const X0 = -12_000;
    const Z0 = -1_000;
    const W = 30_000 / CELL;
    const H = 15_000 / CELL;
    const water = new Uint8Array(W * H);
    const level = new Uint8Array(W * H);
    const raster = (p: DecodedPrimitive, t: readonly number[], s: readonly number[], lvl: number) => {
      for (let q = 0; q < p.indices.length; q += 6) {
        // a quad: two triangles over four distinct vertices
        const ids = [...new Set(p.indices.subarray(q, q + 6))];
        const ys = ids.map((i) => p.positions[i * 3 + 1]!);
        if (ys.some((y) => y !== ys[0])) continue;
        // upward faces only
        const [a, b, c] = ids;
        const ax = p.positions[a! * 3]! * s[0]!;
        const az = p.positions[a! * 3 + 2]! * s[2]!;
        const ny = (p.positions[b! * 3 + 2]! * s[2]! - az) * (p.positions[c! * 3]! * s[0]! - ax) - (p.positions[b! * 3]! * s[0]! - ax) * (p.positions[c! * 3 + 2]! * s[2]! - az);
        if (ny <= 0) continue;
        const isWater = p.colors[ids[0]! * 4 + 3] === 128 && t[1]! + ys[0]! * s[1]! === 0;
        const xs = ids.map((i) => t[0]! + p.positions[i * 3]! * s[0]!);
        const zs = ids.map((i) => t[2]! + p.positions[i * 3 + 2]! * s[2]!);
        const i0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / CELL));
        const i1 = Math.min(W - 1, Math.ceil((Math.max(...xs) - X0) / CELL) - 1);
        const j0 = Math.max(0, Math.floor((Math.min(...zs) - Z0) / CELL));
        const j1 = Math.min(H - 1, Math.ceil((Math.max(...zs) - Z0) / CELL) - 1);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const k = j * W + i;
            // the city's tiles override the horizon; any land wins within a source
            if (level[k]! > lvl) continue;
            if (level[k]! < lvl) water[k] = 1;
            level[k] = lvl;
            if (!isWater) water[k] = 0;
          }
      }
    };
    for (const n of decodeSceneGlb(load(new URL("horizon.glb", CITY)), MeshoptDecoder)) for (const p of n.primitives) raster(p, n.translation, n.scale, 1);
    for (const f of readdirSync(new URL("lod3/", CITY))) {
      const tile = decodeTileGlb(load(new URL(`lod3/${f}`, CITY)), MeshoptDecoder);
      for (const p of tile.primitives) raster(p, tile.translation, [tile.scale, tile.scale, tile.scale], 2);
    }
    const isWater = (x: number, z: number) => {
      const i = Math.floor((x - X0) / CELL);
      const j = Math.floor((z - Z0) / CELL);
      return i >= 0 && j >= 0 && i < W && j < H && water[j * W + i] === 1 && level[j * W + i]! > 0;
    };

    for (const route of LAKE_ROUTES) {
      const v = voyage(route);
      const { length, beam } = BOAT_SIZE[route.kind];
      const p = { x: 0, z: 0, heading: 0 };
      let dry = 0;
      for (let s = 0; s <= v.path.length; s += 5) {
        pointAt(v.path, s, p);
        const fx = Math.sin(p.heading);
        const fz = -Math.cos(p.heading);
        // the hull and four metres around it
        for (let u = -length / 2 - 4; u <= length / 2 + 4; u += 4)
          for (let w = -beam / 2 - 4; w <= beam / 2 + 4; w += 3) if (!isWater(p.x + fx * u - fz * w, p.z + fz * u + fx * w)) dry++;
      }
      expect(dry, `${route.id} touches land`).toBe(0);
    }
  }, 30_000);
});
