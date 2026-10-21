import { describe, expect, it } from "vitest";
import reference from "./postgis-reference.json";
import inverseReference from "./postgis-reference-inverse.json";
import { lv95ToWgs84, wgs84ToLv95 } from "../src/swiss";

// [E, N, lon, lat] computed by PostGIS 3.4 / PROJ 9.4: ST_Transform(EPSG:2056 -> EPSG:4326)
const rows = reference as [number, number, number, number][];

// 1e-9 degrees is about 0.1 mm on the ground
const DEG_TOL = 1e-9;

describe("LV95 -> WGS84", () => {
  it("matches PostGIS for every reference point", () => {
    for (const [e, n, lon, lat] of rows) {
      const r = lv95ToWgs84(e, n);
      expect(Math.abs(r.lon - lon)).toBeLessThan(DEG_TOL);
      expect(Math.abs(r.lat - lat)).toBeLessThan(DEG_TOL);
    }
  });

  it("puts Lausanne-Flon where we expect it", () => {
    const r = lv95ToWgs84(2_537_834.4, 1_152_510.7);
    expect(r.lon).toBeCloseTo(6.6285, 3);
    expect(r.lat).toBeCloseTo(46.521, 3);
  });
});

// [lon, lat, E, N] computed by PostGIS: ST_Transform(EPSG:4326 -> EPSG:2056)
const inverseRows = inverseReference as [number, number, number, number][];

describe("WGS84 -> LV95", () => {
  it("matches PostGIS to a tenth of a millimetre", () => {
    for (const [lon, lat, e, n] of inverseRows) {
      const r = wgs84ToLv95(lon, lat);
      expect(Math.abs(r.e - e)).toBeLessThan(1e-4);
      expect(Math.abs(r.n - n)).toBeLessThan(1e-4);
    }
  });

  it("round-trips within two millimetres", () => {
    // Like PROJ, each direction evaluates the 3-parameter datum shift at height 0
    // on its source ellipsoid, so the two directions differ by up to ~1 mm.
    for (let k = 0; k < 200; k++) {
      const e = 2_480_000 + ((k * 7919) % 360_000);
      const n = 1_075_000 + ((k * 104729) % 220_000);
      const w = lv95ToWgs84(e, n);
      const back = wgs84ToLv95(w.lon, w.lat);
      expect(Math.abs(back.e - e)).toBeLessThan(2e-3);
      expect(Math.abs(back.n - n)).toBeLessThan(2e-3);
    }
  });
});
