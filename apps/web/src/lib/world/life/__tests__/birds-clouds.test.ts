// @vitest-environment node
import { describe, expect, it } from "vitest";
import { birdPose, FLOCKS, hash01 } from "../birds";
import { CLOUD_TILE, cloudOpacity, cloudPosition, makeClouds, random, WIND, wrapAround } from "../clouds";
import { headingOf, wrapAngle } from "../paths";

describe("bird flight paths", () => {
  it("keep each flock around its place, at its height", () => {
    for (const f of FLOCKS) {
      for (let i = 0; i < f.count; i++)
        for (let t = 0; t < 600; t += 7) {
          const p = birdPose(f, i, t);
          // the loop (up to 1.18 R, breathing 15 %) around a centre wandering up to 0.35 R on each axis
          expect(Math.hypot(p.x - f.centre.x, p.z - f.centre.z)).toBeLessThanOrEqual(f.radius * (1.18 * 1.15 + 0.35 * Math.SQRT2) + 1e-6);
          expect(p.y).toBeGreaterThan(f.height - 10);
          expect(p.y).toBeLessThan(f.height + 10);
        }
    }
  });

  it("fly where they face, leaning into the turn", () => {
    for (const f of FLOCKS) {
      const a = birdPose(f, 2, 100);
      const b = birdPose(f, 2, 100.05);
      const moving = headingOf(b.x - a.x, b.z - a.z);
      // the wandering centre adds a little drift to the circling
      expect(Math.abs(wrapAngle(moving - a.heading))).toBeLessThan(0.35);
      expect(Math.sign(a.bank)).toBe(Math.sign(f.turn));
    }
  });

  it("flap and glide like their species: gulls glide most of the time", () => {
    const share = (kind: string) => {
      const f = FLOCKS.find((x) => x.kind === kind)!;
      let flapping = 0;
      let n = 0;
      for (let t = 0; t < 300; t += 0.5)
        for (let i = 0; i < f.count; i++, n++) {
          const flap = birdPose(f, i, t).flap;
          expect([0, 1]).toContain(flap);
          flapping += flap;
        }
      return flapping / n;
    };
    expect(share("gull")).toBeLessThan(0.35);
    expect(share("pigeon")).toBeGreaterThan(0.6);
  });

  it("are the same every visit", () => {
    expect(birdPose(FLOCKS[0]!, 3, 42)).toEqual(birdPose(FLOCKS[0]!, 3, 42));
    expect(hash01(7)).toBe(hash01(7));
    expect(hash01(7)).not.toBe(hash01(8));
  });
});

describe("clouds", () => {
  it("are built the same every visit, flat underneath, high above the city", () => {
    const a = makeClouds(8);
    expect(a).toEqual(makeClouds(8));
    expect(a).toHaveLength(8);
    for (const c of a) {
      expect(c.base).toBeGreaterThanOrEqual(1500);
      expect(c.base).toBeLessThanOrEqual(2000);
      expect(c.cells.length).toBeGreaterThan(30);
      expect(Math.min(...c.cells.map(([, j]) => j))).toBe(0);
    }
    expect(random(1)()).toBe(random(1)());
  });

  it("drift with the wind and repeat around the camera", () => {
    const [c] = makeClouds(1);
    const p0 = cloudPosition(c!, 0, 0, 0);
    const p1 = cloudPosition(c!, 100, 0, 0);
    expect(p1.x - p0.x).toBeCloseTo(WIND.x * 100, 6);
    expect(p1.z - p0.z).toBeCloseTo(WIND.z * 100, 6);
    // always within half a tile of the camera, wherever it is
    for (const cam of [-20_000, -3000, 0, 4321, 50_000]) {
      const p = cloudPosition(c!, 777, cam, -cam);
      expect(Math.abs(p.x - cam)).toBeLessThanOrEqual(CLOUD_TILE / 2);
      expect(Math.abs(p.z + cam)).toBeLessThanOrEqual(CLOUD_TILE / 2);
    }
    expect(wrapAround(7500, 0)).toBe(7500 - CLOUD_TILE);
    expect(wrapAround(-7000, 0)).toBe(-7000);
  });

  it("never veil the city: gone once the camera nears their base, faded far away", () => {
    const base = 1700;
    expect(cloudOpacity(0, 0, base, { x: 0, y: 900, z: 0 })).toBe(1);
    expect(cloudOpacity(0, 0, base, { x: 0, y: base - 100, z: 0 })).toBe(0);
    expect(cloudOpacity(0, 0, base, { x: 0, y: base + 2000, z: 0 })).toBe(0);
    expect(cloudOpacity(7000, 0, base, { x: 0, y: 500, z: 0 })).toBe(0);
    const mid = cloudOpacity(0, 0, base, { x: 0, y: base - 350, z: 0 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
