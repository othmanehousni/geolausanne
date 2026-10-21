// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PLACE_CATEGORIES } from "@/lib/data/types";
import {
  BADGE_CELL,
  badgeSpriteName,
  buildMarkerAtlas,
  DOT_SPRITE,
  GLOW_SELECTED_SPRITE,
  GLOW_SPRITE,
  GLYPHS,
  HALO_FRAMES,
  haloSpriteName,
  MARKER_COLORS,
  SHADOW_SPRITE,
  type AtlasSprite,
} from "../marker-atlas";

const atlas = buildMarkerAtlas();

/** Premultiplied RGBA of a texel of a sprite, (x, y) from its bottom-left corner. */
function texel(s: AtlasSprite, x: number, y: number) {
  const i = ((s.y + y) * atlas.width + s.x + x) * 4;
  return Array.from(atlas.data.subarray(i, i + 4));
}

function opaque(s: AtlasSprite) {
  let n = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (texel(s, x, y)[3]! > 127) n++;
  return n;
}

function hasColour(s: AtlasSprite, [r, g, b]: readonly number[]) {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const t = texel(s, x, y);
      if (t[3] === 255 && t[0] === r && t[1] === g && t[2] === b) return true;
    }
  return false;
}

const sprite = (name: string) => {
  const s = atlas.sprites.get(name);
  if (!s) throw new Error(`no sprite ${name}`);
  return s;
};

describe("marker atlas", () => {
  it("packs every badge, glow, shadow, dot and halo frame without overlap in a 256 × 256 texture", () => {
    expect([atlas.width, atlas.height]).toEqual([256, 256]);
    for (const c of PLACE_CATEGORIES)
      for (const dim of [false, true])
        for (const verified of [false, true]) for (const selected of [false, true]) expect(atlas.sprites.has(badgeSpriteName(c, { dim, verified, selected }))).toBe(true);
    for (const name of [GLOW_SPRITE, GLOW_SELECTED_SPRITE, SHADOW_SPRITE, DOT_SPRITE, badgeSpriteName("add"), badgeSpriteName("add", { selected: true })])
      expect(atlas.sprites.has(name)).toBe(true);
    for (let f = 0; f < HALO_FRAMES; f++) expect(atlas.sprites.has(haloSpriteName(f))).toBe(true);

    const rects = [...atlas.sprites.values()];
    for (const a of rects) {
      expect(a.x).toBeGreaterThanOrEqual(1);
      expect(a.y).toBeGreaterThanOrEqual(1);
      expect(a.x + a.w).toBeLessThanOrEqual(atlas.width - 1);
      expect(a.y + a.h).toBeLessThanOrEqual(atlas.height - 1);
    }
    // a gutter of at least one texel between any two sprites
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const apart = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
        expect(apart).toBe(true);
      }
  });

  it("stores premultiplied colours: nothing is brighter than its opacity", () => {
    for (let i = 0; i < atlas.data.length; i += 4) {
      const a = atlas.data[i + 3]!;
      expect(Math.max(atlas.data[i]!, atlas.data[i + 1]!, atlas.data[i + 2]!)).toBeLessThanOrEqual(a);
    }
  });

  it("anchors every badge on the bottom texel of its pointer, centred", () => {
    for (const c of PLACE_CATEGORIES) {
      const s = sprite(badgeSpriteName(c));
      expect([s.w, s.h]).toEqual([BADGE_CELL, BADGE_CELL]);
      // the pivot sits on the bottom edge of the tip's last texel, in its middle
      expect(s.pivotX % 1).toBe(0.5);
      const col = Math.floor(s.pivotX);
      expect(texel(s, col, s.pivotY)[3]).toBe(255);
      expect(texel(s, col, s.pivotY - 1)[3]).toBe(0);
      expect(texel(s, col - 1, s.pivotY)[3]).toBe(0);
      expect(texel(s, col + 1, s.pivotY)[3]).toBe(0);
      // the badge is symmetric around the tip (glyph aside): same outline on both sides
      expect(s.pivotX).toBe(BADGE_CELL / 2);
      // clicks: the badge and its tip, nothing of the transparent cell
      const [x0, y0, x1, y1] = s.hit;
      expect(x1 - x0).toBe(15);
      expect(y1 - y0).toBe(18);
      expect(y0).toBe(s.pivotY);
    }
  });

  it("draws one distinct 11 × 11 glyph per category", () => {
    const seen = new Set<string>();
    for (const [name, rows] of Object.entries(GLYPHS)) {
      expect(rows, name).toHaveLength(11);
      for (const row of rows) expect(row, name).toMatch(/^[.KW]{11}$/);
      const key = rows.join("");
      expect(seen.has(key), name).toBe(false);
      seen.add(key);
    }
    // the glyph is visible: the sprites of two categories differ
    const a = sprite(badgeSpriteName("cafe"));
    const b = sprite(badgeSpriteName("bakery"));
    let differ = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (texel(a, x, y).join() !== texel(b, x, y).join()) differ++;
    expect(differ).toBeGreaterThan(20);
  });

  it("marks the states: shield when verified, washed out when negative, a ring when selected", () => {
    const base = sprite(badgeSpriteName("restaurant"));
    const verified = sprite(badgeSpriteName("restaurant", { verified: true }));
    const dim = sprite(badgeSpriteName("restaurant", { dim: true }));
    const selected = sprite(badgeSpriteName("restaurant", { selected: true }));
    expect(hasColour(base, MARKER_COLORS.shield)).toBe(false);
    expect(hasColour(verified, MARKER_COLORS.shield)).toBe(true);
    expect(hasColour(base, MARKER_COLORS.saffron)).toBe(true);
    expect(hasColour(dim, MARKER_COLORS.saffron)).toBe(false);
    expect(hasColour(dim, MARKER_COLORS.dim)).toBe(true);
    expect(hasColour(selected, MARKER_COLORS.white)).toBe(true);
    // the ring makes the selected badge larger
    expect(opaque(selected)).toBeGreaterThan(opaque(base) + 50);
    // the glow reaches beyond the badge
    expect(opaque(sprite(GLOW_SPRITE))).toBeGreaterThan(opaque(base));
  });

  it("pulses the location halo outwards and fades it", () => {
    const coverage = Array.from({ length: HALO_FRAMES }, (_, f) => {
      const s = sprite(haloSpriteName(f));
      let sum = 0;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) sum += texel(s, x, y)[3]!;
      return sum;
    });
    // the ring's radius grows: the outermost opaque texel moves out
    const reach = Array.from({ length: HALO_FRAMES }, (_, f) => {
      const s = sprite(haloSpriteName(f));
      let r = 0;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (texel(s, x, y)[3]! > 0) r = Math.max(r, Math.hypot(x + 0.5 - s.pivotX, y + 0.5 - s.pivotY));
      return r;
    });
    for (let f = 1; f < HALO_FRAMES; f++) expect(reach[f]).toBeGreaterThan(reach[f - 1]!);
    expect(coverage[HALO_FRAMES - 1]).toBeLessThan(coverage[0]!);
  });
});
