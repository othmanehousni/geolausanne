/**
 * Pixel-art sprites of the map markers, drawn in code (one character per
 * texel) and packed into one small RGBA atlas at start-up. Pure: no three.js,
 * no DOM, so the layout is unit tested.
 *
 * Every badge shares one 25 × 25 texel cell: a 15 × 18 rounded badge with a
 * pointer tip, an 11 × 11 category glyph, the moderator's shield, and room
 * for the selection ring and the night glow around it. A sprite is placed by
 * its pivot: the tip of a badge, the centre of a dot or a shadow.
 */
import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/data/types";

type Rgba = readonly [number, number, number, number];

function hex(h: string, a = 1): Rgba {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(a * 255)];
}

/** Colours of the markers (sRGB). Saffron is the design system's colour for spots. */
export const MARKER_COLORS = {
  ink: hex("#2e1602"),
  saffron: hex("#f7a73b"),
  saffronLight: hex("#ffd27a"),
  saffronDark: hex("#dc8424"),
  cream: hex("#fff4dc"),
  // negative score: the same badge, washed out
  dimInk: hex("#564b41"),
  dim: hex("#bdb3a6"),
  dimLight: hex("#dcd5cb"),
  dimDark: hex("#a1978a"),
  dimCream: hex("#f1ece5"),
  // certificate checked by a moderator: the interface's Léman-blue shield
  shield: hex("#1f6fb2"),
  shieldLight: hex("#5a9fdc"),
  white: hex("#ffffff"),
  // the visitor's own position
  locationBlue: hex("#2a7fde"),
  locationLight: hex("#7cb8f2"),
  locationEdge: hex("#0f3d6e", 0.6),
} as const;

/** 15 × 18: rounded badge (K outline, H highlight, F fill, S shade) and its pointer tip. */
const BADGE = [
  "..KKKKKKKKKKK..",
  ".KHHHHHHHHHHHK.",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  "KHFFFFFFFFFFFSK",
  ".KSSSSSSSSSSSK.",
  "..KKKKSSSKKKK..",
  ".....KSSSK.....",
  "......KSK......",
  ".......K.......",
];

/**
 * 11 × 11 glyphs, one per category, drawn over the badge's fill
 * (K ink, W cream, `.` lets the fill show).
 */
export const GLYPHS: Record<PlaceCategory | "add", readonly string[]> = {
  // fork and knife
  restaurant: [
    ".K.K.K..K..",
    ".K.K.K..KK.",
    ".K.K.K..KKK",
    ".KKKKK..KKK",
    "..KKK...KKK",
    "...K....KKK",
    "...K....KK.",
    "...K.....K.",
    "...K.....K.",
    "...K.....K.",
    "...K.....K.",
  ],
  // burger: sesame bun, patty, bun
  fast_food: [
    "...........",
    "...KKKKK...",
    "..KKKKKKK..",
    ".KKWKKKWKK.",
    ".KKKKKKKKK.",
    "...........",
    ".KKKKKKKKK.",
    ".KKKKKKKKK.",
    "...........",
    ".KKKKKKKKK.",
    "..KKKKKKK..",
  ],
  // steaming cup on its saucer
  cafe: [
    "...K..K....",
    "..K..K.....",
    "...K..K....",
    "...........",
    ".KKKKKKK...",
    ".KWWWWWKKK.",
    ".KKKKKKK.K.",
    ".KKKKKKKKK.",
    "..KKKKK....",
    "KKKKKKKKK..",
    "...........",
  ],
  // slice of bread
  bakery: [
    "...........",
    "..KKKKKKK..",
    ".KWWWWWWWK.",
    "KWWWWWWWWWK",
    "KWWWWWWWWWK",
    ".KWWWWWWWK.",
    ".KWWWWWWWK.",
    ".KWWWWWWWK.",
    ".KWWWWWWWK.",
    ".KKKKKKKKK.",
    "...........",
  ],
  // drumstick
  butcher: [
    "......KKK..",
    ".....KKKKK.",
    "....KKKKWKK",
    "....KKKKKWK",
    "....KKKKKKK",
    "....KKKKKK.",
    "...KKKKKK..",
    "..KWK......",
    ".KWK.......",
    "KWWK.......",
    ".KK........",
  ],
  // basket
  grocery: [
    "...........",
    "....KKK....",
    "...K...K...",
    "..K.....K..",
    ".KKKKKKKKK.",
    ".KWKWKWKWK.",
    "..KKKKKKK..",
    "..KWKWKWK..",
    "...KKKKK...",
    "...........",
    "...........",
  ],
  // food truck with its serving hatch
  food_truck: [
    "...........",
    "KKKKKKK....",
    "KWWWWWK....",
    "KWWWWWKKK..",
    "KKKKKKKKWK.",
    "KKKKKKKKKKK",
    "KKKKKKKKKKK",
    ".KK....KK..",
    ".KK....KK..",
    "...........",
    "...........",
  ],
  // shop front with a striped awning
  other: [
    "...........",
    ".KKKKKKKKK.",
    ".KWKWKWKWK.",
    ".KWKWKWKWK.",
    "..K.K.K.K..",
    ".K.......K.",
    ".K.KK.KKKK.",
    ".K.KK.K.KK.",
    ".K.KK.KKKK.",
    ".KKKKKKKKK.",
    "...........",
  ],
  // "a new spot here" (placement)
  add: [
    "...........",
    "....KKK....",
    "....KKK....",
    "....KKK....",
    ".KKKKKKKKK.",
    ".KKKKKKKKK.",
    ".KKKKKKKKK.",
    "....KKK....",
    "....KKK....",
    "....KKK....",
    "...........",
  ],
};

/** 7 × 8: filled shield with a check, the design system's "certificate checked by a moderator". */
const SHIELD = [
  ".KKKKK.",
  "KLBBBBK",
  "KBBBBWK",
  "KWBBWBK",
  "KBWWBBK",
  ".KBBBK.",
  "..KBK..",
  "...K...",
];

/** 11 × 3 (in a 13 × 5 canvas): soft contact shadow under a marker's tip (1 light, 2 dark). */
const SHADOW = ["..1111111..", ".122222221.", "..1111111.."];

/** 9 × 9 (in an 11 × 11 canvas): "you are here" (D edge, W white ring, B blue, L highlight). */
const DOT = [
  "..DDDDD..",
  ".DWWWWWD.",
  "DWWBBBWWD",
  "DWBLBBBWD",
  "DWBBBBBWD",
  "DWBBBBBWD",
  "DWWBBBWWD",
  ".DWWWWWD.",
  "..DDDDD..",
];

export interface BadgeStyle {
  /** negative score: washed out */
  dim?: boolean;
  /** certificate checked by a moderator: shield */
  verified?: boolean;
  /** white ring */
  selected?: boolean;
}

/** One sprite of the atlas, in texels. Rows grow upwards (as uploaded to WebGL). */
export interface AtlasSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  /** the point placed on the sprite's anchor, from the sprite's bottom-left corner */
  pivotX: number;
  pivotY: number;
  /** the part that answers clicks, from the bottom-left corner: [x0, y0, x1, y1] */
  hit: readonly [number, number, number, number];
}

export interface MarkerAtlas {
  width: number;
  height: number;
  /**
   * RGBA8, sRGB colours premultiplied by alpha (transparent texels are 0):
   * linear filtering then fades a sprite's edge instead of darkening it.
   */
  data: Uint8Array;
  sprites: ReadonlyMap<string, AtlasSprite>;
}

/** Badge cell: 25 × 25 texels; the badge's top-left corner sits 5 texels in and 4 down. */
export const BADGE_CELL = 25;
const BADGE_X = 5;
const BADGE_Y = 4;
/** Frames of the location halo's pulse. */
export const HALO_FRAMES = 8;
const HALO_CELL = 29;
const ATLAS_WIDTH = 256;
const GUTTER = 1;

/** Name of the badge sprite of a category in a given state. */
export function badgeSpriteName(category: PlaceCategory | "add", style: BadgeStyle = {}): string {
  return `badge:${category}:${style.dim ? "dim" : "default"}${style.verified ? ":verified" : ""}${style.selected ? ":selected" : ""}`;
}

export const GLOW_SPRITE = "glow";
export const GLOW_SELECTED_SPRITE = "glow:selected";
export const SHADOW_SPRITE = "shadow";
export const DOT_SPRITE = "dot";
export const haloSpriteName = (frame: number) => `halo:${frame}`;

/** RGBA8 texels, premultiplied by alpha, rows top-down while drawing. */
class Canvas {
  readonly px: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  /** "over" compositing of colour `c` with an extra opacity */
  set(i: number, c: Rgba, alpha = 1) {
    const a = (c[3] / 255) * alpha;
    const k = 1 - a;
    const p = this.px;
    const o = i * 4;
    p[o] = c[0] * a + p[o]! * k;
    p[o + 1] = c[1] * a + p[o + 1]! * k;
    p[o + 2] = c[2] * a + p[o + 2]! * k;
    p[o + 3] = 255 * a + p[o + 3]! * k;
  }
  draw(pattern: readonly string[], palette: Record<string, Rgba | undefined>, ox: number, oy: number) {
    for (let y = 0; y < pattern.length; y++) {
      const row = pattern[y]!;
      for (let x = 0; x < row.length; x++) {
        const c = palette[row[x]!];
        if (c) this.set((oy + y) * this.w + ox + x, c);
      }
    }
  }
  /** every texel of a mask */
  fill(mask: Uint8Array, c: Rgba, alpha = 1) {
    for (let i = 0; i < mask.length; i++) if (mask[i]) this.set(i, c, alpha);
  }
}

/** Texels of a `BADGE_CELL²` cell (1 = inside). */
type Mask = Uint8Array;

function patternMask(pattern: readonly string[], ox: number, oy: number): Mask {
  const m = new Uint8Array(BADGE_CELL * BADGE_CELL);
  pattern.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== ".") m[(oy + y) * BADGE_CELL + ox + x] = 1;
  });
  return m;
}

/** Texels around a mask (4-neighbourhood): growing a mask one texel at a time keeps it round. */
function ring(mask: Mask): Mask {
  const S = BADGE_CELL;
  const out = new Uint8Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (mask[i]) continue;
      if ((x > 0 && mask[i - 1]) || (x < S - 1 && mask[i + 1]) || (y > 0 && mask[i - S]) || (y < S - 1 && mask[i + S])) out[i] = 1;
    }
  return out;
}

function union(...masks: Mask[]): Mask {
  const out = new Uint8Array(BADGE_CELL * BADGE_CELL);
  for (const m of masks) for (let i = 0; i < out.length; i++) out[i]! |= m[i]!;
  return out;
}

/** Shapes shared by every badge: silhouette, selection ring, its edge, the glows. */
function badgeShapes() {
  const body = patternMask(BADGE, BADGE_X, BADGE_Y);
  const white = ring(body);
  const edge = ring(union(body, white));
  const glow = (base: Mask) => {
    const steps: Mask[] = [];
    let grown = base;
    for (let k = 0; k < 3; k++) {
      const r = ring(grown);
      steps.push(r);
      grown = union(grown, r);
    }
    return { base, steps };
  };
  return { body, white, edge, glow: glow(body), glowSelected: glow(union(body, white, edge)) };
}

type Shapes = ReturnType<typeof badgeShapes>;

function badgeCanvas(shapes: Shapes, category: PlaceCategory | "add", style: BadgeStyle): Canvas {
  const c = new Canvas(BADGE_CELL, BADGE_CELL);
  const C = MARKER_COLORS;
  const dim = style.dim ?? false;
  const add = category === "add";
  const ink = dim ? C.dimInk : C.ink;
  // the placement ghost is a light badge with a saffron cross
  const body = add
    ? { K: C.saffronDark, H: C.white, F: C.cream, S: hex("#f2dfb8") }
    : dim
      ? { K: ink, H: C.dimLight, F: C.dim, S: C.dimDark }
      : { K: ink, H: C.saffronLight, F: C.saffron, S: C.saffronDark };
  if (style.selected) {
    // a white ring, edged with faint ink so that it also reads on pale roofs
    c.fill(shapes.edge, C.ink, 0.42);
    c.fill(shapes.white, C.white);
  }
  c.draw(BADGE, body, BADGE_X, BADGE_Y);
  c.draw(GLYPHS[category], { K: add ? C.saffronDark : ink, W: add ? C.white : dim ? C.dimCream : C.cream }, BADGE_X + 2, BADGE_Y + 2);
  if (style.verified) c.draw(SHIELD, { K: ink, B: C.shield, L: C.shieldLight, W: C.white }, BADGE_X + 12, BADGE_Y - 3);
  return c;
}

/** Stepped halo around a badge's silhouette, white (tinted when drawn): the night glow. */
function glowCanvas({ base, steps }: Shapes["glow"]): Canvas {
  const c = new Canvas(BADGE_CELL, BADGE_CELL);
  // full under the badge (hidden by it), then three fading steps
  c.fill(base, MARKER_COLORS.white, 0.75);
  [0.62, 0.34, 0.15].forEach((a, k) => c.fill(steps[k]!, MARKER_COLORS.white, a));
  return c;
}

function haloCanvas(frame: number): Canvas {
  const c = new Canvas(HALO_CELL, HALO_CELL);
  const centre = (HALO_CELL - 1) / 2;
  const t = frame / HALO_FRAMES;
  const r = 4.5 + t * 9;
  const alpha = 0.8 * (1 - t) ** 1.2;
  for (let y = 0; y < HALO_CELL; y++)
    for (let x = 0; x < HALO_CELL; x++) {
      const d = Math.hypot(x - centre, y - centre);
      if (Math.abs(d - r) < 0.75) c.set(y * HALO_CELL + x, MARKER_COLORS.locationBlue, alpha);
      else if (d < r - 0.75) c.set(y * HALO_CELL + x, MARKER_COLORS.locationBlue, alpha * 0.3);
    }
  return c;
}

interface Item {
  name: string;
  canvas: Canvas;
  pivotX: number;
  /** from the top, while drawing */
  pivotTop: number;
  /** clickable box from the top-left corner: [x0, y0, x1, y1] */
  hitTop: readonly [number, number, number, number];
}

let cached: MarkerAtlas | null = null;

/** The atlas, built once per page (a few milliseconds). */
export function markerAtlas(): MarkerAtlas {
  cached ??= buildMarkerAtlas();
  return cached;
}

export function buildMarkerAtlas(): MarkerAtlas {
  const shapes = badgeShapes();
  const items: Item[] = [];
  const badge = { pivotX: BADGE_X + 7.5, pivotTop: BADGE_Y + 18, hitTop: [BADGE_X, BADGE_Y, BADGE_X + 15, BADGE_Y + 18] as const };
  for (const category of [...PLACE_CATEGORIES, "add" as const])
    for (const dim of [false, true])
      for (const verified of [false, true])
        for (const selected of [false, true]) {
          if (category === "add" && (dim || verified)) continue;
          const style = { dim, verified, selected };
          items.push({ name: badgeSpriteName(category, style), canvas: badgeCanvas(shapes, category, style), ...badge });
        }
  items.push({ name: GLOW_SPRITE, canvas: glowCanvas(shapes.glow), ...badge });
  items.push({ name: GLOW_SELECTED_SPRITE, canvas: glowCanvas(shapes.glowSelected), ...badge });

  // a transparent texel around the small sprites keeps their edges filtered alike
  const C = MARKER_COLORS;
  const shadow = new Canvas(13, 5);
  shadow.draw(SHADOW, { "1": hex("#1c1208", 0.22), "2": hex("#1c1208", 0.42) }, 1, 1);
  items.push({ name: SHADOW_SPRITE, canvas: shadow, pivotX: 6.5, pivotTop: 2.5, hitTop: [1, 1, 12, 4] });
  const dot = new Canvas(11, 11);
  dot.draw(DOT, { D: C.locationEdge, W: C.white, B: C.locationBlue, L: C.locationLight }, 1, 1);
  items.push({ name: DOT_SPRITE, canvas: dot, pivotX: 5.5, pivotTop: 5.5, hitTop: [1, 1, 10, 10] });
  for (let f = 0; f < HALO_FRAMES; f++)
    items.push({ name: haloSpriteName(f), canvas: haloCanvas(f), pivotX: HALO_CELL / 2, pivotTop: HALO_CELL / 2, hitTop: [0, 0, HALO_CELL, HALO_CELL] });

  // shelf packing, a gutter of transparent texels around every sprite
  let x = GUTTER;
  let top = GUTTER;
  let shelf = 0;
  const at: { x: number; top: number }[] = [];
  for (const it of items) {
    if (x + it.canvas.w + GUTTER > ATLAS_WIDTH) {
      x = GUTTER;
      top += shelf + GUTTER;
      shelf = 0;
    }
    at.push({ x, top });
    x += it.canvas.w + GUTTER;
    shelf = Math.max(shelf, it.canvas.h);
  }
  let height = 1;
  while (height < top + shelf + GUTTER) height *= 2;

  const width = ATLAS_WIDTH;
  const data = new Uint8Array(width * height * 4);
  const sprites = new Map<string, AtlasSprite>();
  items.forEach((it, n) => {
    const { w, h, px } = it.canvas;
    const sx = at[n]!.x;
    // rows grow upwards in WebGL: the sprite's top row is its highest
    const sy = height - at[n]!.top - h;
    for (let row = 0; row < h; row++) data.set(px.subarray(row * w * 4, (row + 1) * w * 4), ((sy + h - 1 - row) * width + sx) * 4);
    const [hx0, hy0, hx1, hy1] = it.hitTop;
    sprites.set(it.name, { x: sx, y: sy, w, h, pivotX: it.pivotX, pivotY: h - it.pivotTop, hit: [hx0, h - hy1, hx1, h - hy0] });
  });
  return { width, height, data, sprites };
}
