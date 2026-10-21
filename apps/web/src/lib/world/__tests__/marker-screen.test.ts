// @vitest-environment node
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { badgeSpriteName, markerAtlas } from "../marker-atlas";
import { badgeSizeFor, badgeTexelSize, drawOrder, markerTexelSize, projectToScreen, ScreenHits, selectBounce, spriteHitRect, type ScreenPoint } from "../marker-screen";

const W = 800;
const H = 600;

/** A camera 500 m south of the origin and 300 m up, looking at it. */
function camera() {
  const cam = new THREE.PerspectiveCamera(45, W / H, 1, 90_000);
  cam.position.set(0, 300, 500);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

function viewProj(cam: THREE.PerspectiveCamera) {
  return new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
}

const badge = markerAtlas().sprites.get(badgeSpriteName("restaurant"))!;

describe("projectToScreen", () => {
  it("agrees with three's projection, in CSS pixels from the top-left corner", () => {
    const cam = camera();
    const m = viewProj(cam);
    const out: ScreenPoint = { x: 0, y: 0, depth: 0 };
    for (const p of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(120, 40, -80), new THREE.Vector3(-200, 0, 100)]) {
      expect(projectToScreen(m, p.x, p.y, p.z, W, H, out)).toBe(true);
      const ndc = p.clone().project(cam);
      expect(out.x).toBeCloseTo((ndc.x + 1) * 0.5 * W, 4);
      expect(out.y).toBeCloseTo((1 - ndc.y) * 0.5 * H, 4);
    }
    // the target is in the middle of the screen
    projectToScreen(m, 0, 0, 0, W, H, out);
    expect(out.x).toBeCloseTo(W / 2, 4);
    expect(out.y).toBeCloseTo(H / 2, 4);
  });

  it("follows the camera's view offset (the map centred beside an open panel)", () => {
    const cam = camera();
    // ViewportInsets: the view shifted by half a 408 px side panel
    cam.setViewOffset(W, H, -204, 0, W, H);
    const m = viewProj(cam);
    const out: ScreenPoint = { x: 0, y: 0, depth: 0 };
    for (const p of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(120, 40, -80)]) {
      projectToScreen(m, p.x, p.y, p.z, W, H, out);
      const ndc = p.clone().project(cam);
      expect(out.x).toBeCloseTo((ndc.x + 1) * 0.5 * W, 4);
      expect(out.y).toBeCloseTo((1 - ndc.y) * 0.5 * H, 4);
    }
    // the target now sits in the middle of the uncovered part, right of the centre
    projectToScreen(m, 0, 0, 0, W, H, out);
    expect(out.x).toBeCloseTo(W / 2 + 204, 4);
    expect(out.y).toBeCloseTo(H / 2, 4);
  });

  it("refuses points behind the camera and orders the others by distance", () => {
    const cam = camera();
    const m = viewProj(cam);
    const out: ScreenPoint = { x: 0, y: 0, depth: 0 };
    expect(projectToScreen(m, 0, 400, 900, W, H, out)).toBe(false);
    projectToScreen(m, 0, 0, 0, W, H, out);
    const near = out.depth;
    projectToScreen(m, 0, 0, -400, W, H, out);
    expect(out.depth).toBeGreaterThan(near);
  });
});

describe("markerTexelSize", () => {
  it("draws badges 2 CSS px per texel up close and 1.5 far away on dense screens", () => {
    expect(markerTexelSize(100, 2)).toBe(2);
    expect(markerTexelSize(8000, 2)).toBe(1.5);
    let prev = Infinity;
    for (let d = 0; d < 9000; d += 250) {
      const s = markerTexelSize(d, 2);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
    // a 15-texel badge: 30 px near, never under 22 px
    expect(15 * markerTexelSize(9000, 1.5)).toBeGreaterThanOrEqual(22);
  });

  it("covers whole render pixels where pixels are large, so the pixel art stays crisp", () => {
    for (const pxPerCss of [0.5, 0.75, 1]) {
      for (const d of [100, 2000, 9000]) {
        const renderPx = markerTexelSize(d, pxPerCss) * pxPerCss;
        expect(renderPx).toBe(Math.round(renderPx));
        expect(renderPx).toBeGreaterThanOrEqual(1);
      }
    }
    // a canvas rendered at half resolution: one render pixel per texel, still 2 CSS px
    expect(markerTexelSize(100, 0.5)).toBe(2);
    // the selected badge grows where the resolution allows it
    expect(markerTexelSize(100, 2, 1.12)).toBeGreaterThan(markerTexelSize(100, 2));
  });
});

describe("badgeSizeFor", () => {
  /** render pixels per CSS pixel of a pixel look whose art pixel is `css` CSS pixels, a whole number of device pixels */
  const artPixelRatio = (css: number, dpr: number) => dpr / Math.max(1, Math.round(css * dpr));

  it("switches to compact badges where whole render pixels would make a full badge too wide", () => {
    expect(badgeSizeFor(2)).toBe("full");
    expect(badgeSizeFor(1)).toBe("full");
    // a 2 px art pixel: one render pixel per texel, 30 px
    expect(badgeSizeFor(0.5)).toBe("full");
    // 1.5 px art pixels on a 2× phone: 22.5 px, still full
    expect(badgeSizeFor(2 / 3)).toBe("full");
    // 2.4 and 3 CSS px per render pixel: 36 and 45 px full badges
    expect(badgeSizeFor(1 / 2.4)).toBe("compact");
    expect(badgeSizeFor(1 / 3)).toBe("compact");
    // 1.33 CSS px per render pixel: two per texel would make it 40 px
    expect(badgeSizeFor(0.75)).toBe("compact");
    expect(badgeTexelSize("compact", 100, 0.75) * 11).toBeCloseTo(29.33, 2);
  });

  it("keeps badges about 22–38 CSS px wide at every art pixel size and screen density", () => {
    const atlas = markerAtlas();
    const widths: number[] = [];
    for (const css of [0, 1.5, 2, 3])
      for (const dpr of [1, 1.25, 1.5, 2, 3]) {
        // 0: no pixel look, the canvas at the device's resolution
        const pxPerCss = css === 0 ? dpr : artPixelRatio(css, dpr);
        const size = badgeSizeFor(pxPerCss);
        const s = atlas.sprites.get(badgeSpriteName("cafe", {}, size))!;
        for (const distance of [200, 3000]) {
          const texel = badgeTexelSize(size, distance, pxPerCss);
          const width = (s.hit[2] - s.hit[0]) * texel;
          widths.push(width);
          expect(width, `art pixel ${css} px at ${dpr}×, ${distance} m`).toBeGreaterThanOrEqual(22);
          expect(width, `art pixel ${css} px at ${dpr}×, ${distance} m`).toBeLessThanOrEqual(38);
          // whole render pixels per texel wherever pixels are large
          if (pxPerCss < 1.25) expect(texel * pxPerCss).toBeCloseTo(Math.round(texel * pxPerCss), 9);
        }
      }
    // without the compact badges, a 3 px art pixel would make 45 px badges
    expect(15 * markerTexelSize(200, artPixelRatio(3, 1))).toBe(45);
    expect(Math.max(...widths)).toBeLessThan(45);
  });
});

describe("spriteHitRect", () => {
  it("puts the badge above its anchor, its tip on it, and lifts it", () => {
    const [l, t, r, b] = spriteHitRect(400, 300, badge, 2, 0);
    expect(r - l).toBe(30);
    expect(b - t).toBe(36);
    expect(b).toBe(300);
    expect((l + r) / 2).toBe(400);
    const lifted = spriteHitRect(400, 300, badge, 2, 5);
    expect(lifted[3]).toBe(295);
    expect(lifted[1]).toBe(t - 5);
  });
});

describe("ScreenHits", () => {
  it("answers the front-most marker under the pointer, with a margin", () => {
    const hits = new ScreenHits<string>(1);
    // drawn back to front: "far" first, "near" over it
    hits.add("far", [100, 100, 130, 136], W, H);
    hits.add("near", [110, 110, 140, 146], W, H);
    expect(hits.pick(120, 120)).toBe("near");
    expect(hits.pick(105, 105)).toBe("far");
    expect(hits.pick(145, 120)).toBeNull();
    expect(hits.pick(145, 120, 6)).toBe("near");
    expect(hits.count).toBe(2);
    hits.clear();
    expect(hits.pick(120, 120)).toBeNull();
  });

  it("ignores markers entirely off screen", () => {
    const hits = new ScreenHits<string>();
    hits.add("left", [-40, 100, -10, 136], W, H);
    hits.add("below", [100, 610, 130, 646], W, H);
    hits.add("edge", [-10, 100, 20, 136], W, H);
    expect(hits.count).toBe(1);
    expect(hits.pick(5, 120)).toBe("edge");
  });

  it("picks what a real camera shows in front when two badges overlap on screen", () => {
    const cam = camera();
    const m = viewProj(cam);
    // two spots on the same line of sight: the nearer one hides the other
    const near = new THREE.Vector3(0, 0, 0);
    const far = near.clone().add(near.clone().sub(cam.position).normalize().multiplyScalar(300));
    const anchors = [far, near];
    const pts = anchors.map((a) => {
      const out: ScreenPoint = { x: 0, y: 0, depth: 0 };
      projectToScreen(m, a.x, a.y, a.z, W, H, out);
      return out;
    });
    const order = drawOrder(
      pts.map((p) => p.depth),
      -1,
      -1,
    );
    const hits = new ScreenHits<string>();
    for (const i of order) hits.add(i === 0 ? "far" : "near", spriteHitRect(pts[i]!.x, pts[i]!.y, badge, 2, 0), W, H);
    expect(hits.pick(pts[1]!.x, pts[1]!.y - 15)).toBe("near");
    // hovering the far one brings it to the front
    const hoverFar = drawOrder(
      pts.map((p) => p.depth),
      -1,
      0,
    );
    expect(hoverFar.at(-1)).toBe(0);
  });
});

describe("drawOrder", () => {
  it("draws far to near, then the selected marker, then the hovered one", () => {
    expect(drawOrder([10, 30, 20, 5], -1, -1)).toEqual([1, 2, 0, 3]);
    expect(drawOrder([10, 30, 20, 5], 3, -1)).toEqual([1, 2, 0, 3]);
    expect(drawOrder([10, 30, 20, 5], 3, 1)).toEqual([2, 0, 3, 1]);
    expect(drawOrder([10, 30, 20, 5], 2, 2)).toEqual([1, 0, 3, 2]);
    expect(drawOrder([], -1, -1)).toEqual([]);
  });
});

describe("selectBounce", () => {
  it("hops once and lands within half a second", () => {
    expect(selectBounce(0)).toBe(0);
    const peak = Math.max(...Array.from({ length: 45 }, (_, i) => selectBounce(i / 100)));
    expect(peak).toBeGreaterThan(10);
    expect(peak).toBeLessThanOrEqual(12);
    expect(selectBounce(0.38)).toBeGreaterThan(0);
    expect(selectBounce(0.45)).toBe(0);
    expect(selectBounce(3)).toBe(0);
    for (let t = 0; t <= 0.45; t += 0.01) expect(selectBounce(t)).toBeGreaterThanOrEqual(0);
  });
});
