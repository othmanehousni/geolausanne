// @vitest-environment node
import { describe, expect, it } from "vitest";
import { headingOf, pointAt, smoothPath, wrapAngle } from "../paths";

describe("smoothPath", () => {
  it("passes through its waypoints and measures its length", () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 300, z: 0 },
      { x: 300, z: 400 },
      { x: 0, z: 400 },
    ];
    const path = smoothPath(pts, 5);
    for (const p of pts) {
      let best = Infinity;
      for (let i = 0; i < path.xs.length; i++) best = Math.min(best, Math.hypot(path.xs[i]! - p.x, path.zs[i]! - p.z));
      expect(best).toBeLessThan(1e-6);
    }
    // a little longer than the polyline's 1 000 m, never much
    expect(path.length).toBeGreaterThan(990);
    expect(path.length).toBeLessThan(1150);
  });

  it("turns gradually: no kink anywhere along the curve", () => {
    const path = smoothPath(
      [
        { x: 0, z: 0 },
        { x: 500, z: 0 },
        { x: 500, z: 500 },
        { x: 1000, z: 600 },
      ],
      5,
    );
    const a = { x: 0, z: 0, heading: 0 };
    const b = { x: 0, z: 0, heading: 0 };
    for (let s = 0; s + 10 <= path.length; s += 10) {
      pointAt(path, s, a);
      pointAt(path, s + 10, b);
      // under 0.3 rad per 10 m: a radius of 33 m or more
      expect(Math.abs(wrapAngle(b.heading - a.heading))).toBeLessThan(0.3);
    }
  });
});

describe("pointAt", () => {
  it("walks the path by distance, clamped to its ends", () => {
    const path = smoothPath(
      [
        { x: 0, z: 0 },
        { x: 0, z: -100 },
      ],
      10,
    );
    expect(pointAt(path, 50)).toMatchObject({ x: 0, z: -50 });
    expect(pointAt(path, -10)).toMatchObject({ x: 0, z: 0 });
    expect(pointAt(path, 1e6)).toMatchObject({ x: 0, z: -100 });
    // towards −z is north: heading 0
    expect(pointAt(path, 50).heading).toBeCloseTo(0, 6);
  });
});

describe("headings", () => {
  it("count clockwise from north, as on a compass", () => {
    expect(headingOf(0, -1)).toBeCloseTo(0);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(headingOf(0, 1))).toBeCloseTo(Math.PI);
    expect(headingOf(-1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI);
  });
});
