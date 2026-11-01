import { describe, expect, it } from "vitest";
import { artPixelRatio, devicePixelsFor, fogRange, HOME_VIEW, isPixelStyle, isSmoothLevel, maxVoxelPxFor, NARROW_SCREEN, PIXEL_ZOOM, pixelSizeAt, pixelSizeFor, QUALITY } from "../config";

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

  it("never antialias the canvas, and smooth only the far view of medium and high", () => {
    for (const p of Object.values(QUALITY)) expect(p.antialias).toBe(false);
    expect(QUALITY.low.smoothFar).toBe(false);
    expect(QUALITY.medium.smoothFar).toBe(true);
    expect(QUALITY.high.smoothFar).toBe(true);
  });
});

describe("pixels that follow the zoom", () => {
  it("keeps the close-up size near the city, and the home view is close-up", () => {
    for (const p of Object.values(QUALITY)) {
      expect(pixelSizeAt(p, 1440, 100)).toBe(p.pixelSize.wide);
      expect(pixelSizeAt(p, 390, PIXEL_ZOOM.near)).toBe(p.pixelSize.narrow);
    }
    // the first view still renders at the close-up resolution
    for (const dpr of [1, 2, 3]) {
      const close = devicePixelsFor(QUALITY.high.pixelSize.wide, dpr);
      expect(devicePixelsFor(pixelSizeAt(QUALITY.high, 1440, HOME_VIEW.distance), dpr)).toBe(close);
    }
  });

  it("shrinks pixels to the far size as the camera pulls back, never growing them", () => {
    for (const p of Object.values(QUALITY)) {
      expect(pixelSizeAt(p, 1440, PIXEL_ZOOM.far)).toBe(p.pixelSize.far);
      expect(pixelSizeAt(p, 1440, 9000)).toBe(p.pixelSize.far);
      let last = Infinity;
      for (let d = 0; d <= 10_000; d += 250) {
        const s = pixelSizeAt(p, 1440, d);
        expect(s).toBeLessThanOrEqual(last);
        last = s;
      }
    }
    // a narrow screen whose close-up pixels are already smaller than the far size keeps them
    expect(pixelSizeAt({ pixelSize: { wide: 2, narrow: 1, far: 1.5, fine: 1, sharp: 0.5 } }, 390, 9000)).toBe(1);
  });

  it("changes the resolution only past a margin, so it does not flicker at a boundary", () => {
    // 2 device pixels per rendered pixel: kept from 1.25 to 2.75
    expect(devicePixelsFor(1.3, 1, 2)).toBe(2);
    expect(devicePixelsFor(1.2, 1, 2)).toBe(1);
    expect(devicePixelsFor(2.7, 1, 2)).toBe(2);
    expect(devicePixelsFor(2.8, 1, 2)).toBe(3);
    // and from 1: 1.75 is needed to go back to 2
    expect(devicePixelsFor(1.7, 1, 1)).toBe(1);
    expect(devicePixelsFor(1.8, 1, 1)).toBe(2);
    // a big jump is taken at once; nonsense current values are ignored
    expect(devicePixelsFor(1, 2, 6)).toBe(2);
    expect(devicePixelsFor(2, 1, 0)).toBe(2);
    expect(devicePixelsFor(2, 1, Number.NaN)).toBe(2);
  });

  it("zooming out then in passes through the same few resolutions", () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      let n: number | undefined;
      const seen: number[] = [];
      for (const d of [...Array.from({ length: 41 }, (_, i) => i * 250), ...Array.from({ length: 41 }, (_, i) => 10_000 - i * 250)]) {
        const next = devicePixelsFor(pixelSizeAt(QUALITY.high, 1440, d), dpr, n);
        if (next !== n) seen.push(next);
        n = next;
      }
      const close = devicePixelsFor(QUALITY.high.pixelSize.wide, dpr);
      const far = devicePixelsFor(QUALITY.high.pixelSize.far, dpr);
      // every step on the way out and back, and nothing else
      expect(seen[0]).toBe(close);
      expect(Math.min(...seen)).toBe(far);
      expect(seen.at(-1)).toBe(close);
      expect(seen.length).toBeLessThanOrEqual(2 * (close - far) + 1);
    }
  });

  it("smooths (MSAA) only the far size", () => {
    expect(isSmoothLevel(QUALITY.high, 1, 1)).toBe(true);
    expect(isSmoothLevel(QUALITY.high, 2, 1)).toBe(false);
    expect(isSmoothLevel(QUALITY.high, 2, 2)).toBe(true);
    expect(isSmoothLevel(QUALITY.high, 3, 2)).toBe(false);
    expect(isSmoothLevel(QUALITY.low, 1, 1)).toBe(false);
  });
});

describe("fog", () => {
  it("is unchanged around the home view and moves out with the zoom", () => {
    expect(fogRange(HOME_VIEW.distance)).toEqual([2200, 17_000]);
    expect(fogRange(100)).toEqual([2200, 17_000]);
    const [near, far] = fogRange(9000);
    // the point the camera looks at, 9 km away, is clear of the fog
    expect(near).toBeGreaterThan(9000);
    expect(far - near).toBe(14_800);
  });
});

describe("pixel styles", () => {
  it("large is the pixel art that follows the zoom; it is also what no style means", () => {
    for (const d of [100, HOME_VIEW.distance, 2400, 9000]) {
      expect(pixelSizeAt(QUALITY.high, 1440, d, "large")).toBe(pixelSizeAt(QUALITY.high, 1440, d));
    }
    expect(pixelSizeAt(QUALITY.high, 1440, 100, "large")).toBe(2);
  });

  it("fine is one CSS pixel at every distance, and never coarser than large", () => {
    for (const d of [25, HOME_VIEW.distance, 9000]) {
      expect(pixelSizeAt(QUALITY.high, 1440, d, "fine")).toBe(1);
      expect(pixelSizeAt(QUALITY.medium, 390, d, "fine")).toBe(1);
      for (const p of Object.values(QUALITY)) expect(pixelSizeAt(p, 1440, d, "fine")).toBeLessThanOrEqual(pixelSizeAt(p, 1440, d, "large"));
    }
    // the low preset (weak devices): 2 up close instead of 3, its far size from afar
    expect(pixelSizeAt(QUALITY.low, 1440, 100, "fine")).toBe(2);
    expect(pixelSizeAt(QUALITY.low, 1440, 9000, "fine")).toBe(1.5);
    // so the home view renders one device pixel per CSS pixel on a plain screen, two on a retina one
    expect(devicePixelsFor(pixelSizeAt(QUALITY.high, 1440, HOME_VIEW.distance, "fine", 1), 1)).toBe(1);
    expect(devicePixelsFor(pixelSizeAt(QUALITY.high, 1440, HOME_VIEW.distance, "fine", 2), 2)).toBe(2);
  });

  it("sharp uses the screen's own pixels, at most twice the CSS resolution", () => {
    const n = (dpr: number, preset = QUALITY.high) => devicePixelsFor(pixelSizeAt(preset, 1440, 300, "sharp", dpr), dpr);
    expect(n(1)).toBe(1);
    expect(n(2)).toBe(1);
    // a 3× phone renders at 1.5× its CSS size, not 3×
    expect(n(3)).toBe(2);
    // the low preset stays at its fine size
    expect(pixelSizeAt(QUALITY.low, 1440, 300, "sharp", 2)).toBe(pixelSizeAt(QUALITY.low, 1440, 300, "fine", 2));
  });

  it("antialiases fine and sharp pixels on medium and high, never on low", () => {
    for (const dpr of [1, 2, 3]) {
      for (const style of ["fine", "sharp"] as const) {
        const nHigh = devicePixelsFor(pixelSizeAt(QUALITY.high, 1440, 300, style, dpr), dpr);
        expect(isSmoothLevel(QUALITY.high, nHigh, dpr)).toBe(true);
        const nLow = devicePixelsFor(pixelSizeAt(QUALITY.low, 1440, 300, style, dpr), dpr);
        expect(isSmoothLevel(QUALITY.low, nLow, dpr)).toBe(false);
      }
    }
  });

  it("refines tiles sooner with fine and sharp pixels", () => {
    expect(maxVoxelPxFor(QUALITY.high, "large")).toBe(QUALITY.high.maxVoxelPx);
    expect(maxVoxelPxFor(QUALITY.high, "fine")).toBeCloseTo(1.5);
    expect(maxVoxelPxFor(QUALITY.high, "sharp")).toBe(maxVoxelPxFor(QUALITY.high, "fine"));
  });

  it("knows its names", () => {
    expect(isPixelStyle("fine")).toBe(true);
    expect(isPixelStyle("huge")).toBe(false);
    expect(isPixelStyle(null)).toBe(false);
  });
});
