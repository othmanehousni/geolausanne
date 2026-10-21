// @vitest-environment node
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { easeInOut, easeOut, lerpOrbit, orbitOf, orbitPosition, shortestAngle, type Orbit } from "../orbit";

const orbit = (azimuth: number, distance = 1000, polar = 1): Orbit => ({ target: new THREE.Vector3(10, 20, 30), distance, azimuth, polar });

describe("shortestAngle", () => {
  it("turns the short way round", () => {
    expect(shortestAngle(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(shortestAngle(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2);
    expect(shortestAngle(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
    expect(Math.abs(shortestAngle(Math.PI, 0))).toBeCloseTo(Math.PI);
  });
});

describe("orbits", () => {
  it("round-trip through camera positions", () => {
    const o = orbit(0.35, 1450, 1.02);
    const back = orbitOf(orbitPosition(o), o.target);
    expect(back.distance).toBeCloseTo(1450, 6);
    expect(back.azimuth).toBeCloseTo(0.35, 9);
    expect(back.polar).toBeCloseTo(1.02, 9);
    expect(back.target.equals(o.target)).toBe(true);
  });

  it("puts azimuth 0 south of the target, looking north", () => {
    const p = orbitPosition(orbit(0));
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.z).toBeGreaterThan(30);
  });

  it("turn around the target, not across it", () => {
    // facing south, then north again: a straight line would pass over the target
    const from = orbit(Math.PI);
    const to = orbit(0);
    const out = orbit(0);
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      const p = orbitPosition(lerpOrbit(from, to, k, out));
      expect(p.distanceTo(from.target)).toBeCloseTo(1000, 6);
    }
    expect(lerpOrbit(from, to, 1, out).azimuth % (2 * Math.PI)).toBeCloseTo(0, 9);
  });

  it("take the short way across north", () => {
    const out = orbit(0);
    const mid = lerpOrbit(orbit(0.2), orbit(2 * Math.PI - 0.2), 0.5, out);
    expect(Math.cos(mid.azimuth)).toBeCloseTo(1, 9);
  });

  it("interpolate target, distance and tilt linearly", () => {
    const a = orbit(0, 1000, 0.5);
    const b = { ...orbit(0, 2000, 1.5), target: new THREE.Vector3(110, 20, -70) };
    const mid = lerpOrbit(a, b, 0.5, orbit(0));
    expect(mid.distance).toBeCloseTo(1500);
    expect(mid.polar).toBeCloseTo(1);
    expect(mid.target.toArray()).toEqual([60, 20, -20]);
  });
});

describe("easing", () => {
  it("starts and ends at rest positions", () => {
    for (const f of [easeOut, easeInOut]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
    }
  });

  it("moves short steps most of the way at once", () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.55);
    expect(easeInOut(0.25)).toBeLessThan(0.1);
  });
});
