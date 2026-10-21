import { describe, expect, it } from "vitest";
import { artPixelRatio, NARROW_SCREEN, pixelSizeFor, QUALITY } from "../config";

describe("pixel-art canvas resolution", () => {
  it("covers a whole number of device pixels per rendered pixel", () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      for (const size of [1.5, 2, 3]) {
        const r = artPixelRatio(size, dpr);
        const devicePixels = dpr / r;
        expect(devicePixels).toBeCloseTo(Math.round(devicePixels), 9);
        // close to the requested size in CSS pixels
        expect(Math.abs(1 / r - size)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
      }
    }
  });

  it("matches the usual screens exactly", () => {
    expect(artPixelRatio(2, 1)).toBe(0.5);
    expect(artPixelRatio(2, 2)).toBe(0.5);
    expect(artPixelRatio(3, 1)).toBeCloseTo(1 / 3);
    expect(artPixelRatio(1.5, 2)).toBeCloseTo(2 / 3);
  });

  it("never asks for less than one device pixel and survives odd ratios", () => {
    expect(artPixelRatio(0.1, 1)).toBe(1);
    expect(artPixelRatio(2, 0)).toBe(0.5);
    expect(artPixelRatio(2, Number.NaN)).toBe(0.5);
  });

  it("uses finer pixels on narrow screens", () => {
    for (const p of Object.values(QUALITY)) {
      expect(pixelSizeFor(p, NARROW_SCREEN - 1)).toBe(p.pixelSize.narrow);
      expect(pixelSizeFor(p, 1440)).toBe(p.pixelSize.wide);
      expect(p.pixelSize.narrow).toBeLessThanOrEqual(p.pixelSize.wide);
    }
  });
});

describe("quality presets", () => {
  it("stay meaningful: low is the lightest, high the finest", () => {
    const { low, medium, high } = QUALITY;
    expect(low.maxVoxelPx).toBeGreaterThan(medium.maxVoxelPx);
    expect(medium.maxVoxelPx).toBeGreaterThan(high.maxVoxelPx);
    expect(low.budgetMB).toBeLessThan(medium.budgetMB);
    expect(medium.budgetMB).toBeLessThan(high.budgetMB);
    expect(low.maxConcurrent).toBeLessThan(high.maxConcurrent);
    // the low preset renders the fewest pixels and skips the outline pass
    expect(low.pixelSize.wide).toBeGreaterThan(high.pixelSize.wide);
    expect(low.outlines).toBe(false);
    expect(high.outlines).toBe(true);
  });

  it("never smear the pixels with MSAA", () => {
    for (const p of Object.values(QUALITY)) expect(p.antialias).toBe(false);
  });

  it("give R3F a fixed pixel ratio for this screen", () => {
    const [min, max] = QUALITY.high.dpr;
    expect(min).toBe(max);
    expect(min).toBe(artPixelRatio(pixelSizeFor(QUALITY.high, window.innerWidth), window.devicePixelRatio || 1));
    expect(QUALITY.low.dpr[0]).toBeLessThan(QUALITY.high.dpr[0]);
  });
});
