/**
 * Pixel-art sprites of the map markers, drawn in code (one character per
 * texel) and packed into one small RGBA atlas at start-up. Pure: no three.js,
 * no DOM, so the layout is unit tested.
 *
 * Every badge shares one 25 × 25 texel cell: a 15 × 18 rounded badge with a
 * pointer tip, an 11 × 11 category glyph, the moderator's shield, and room
 * for the selection ring and the night glow around it. A compact set
 * (11 × 13 badges, 7 × 7 glyphs, 21 × 21 cells) serves canvases whose render
 * pixels are coarse, where a full badge would grow too large on screen. A
 * sprite is placed by its pivot: the tip of a badge, the centre of a dot or
 * a shadow.
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

/** 11 × 13: the compact badge, same anatomy as the full one. */
const COMPACT_BADGE = [
  "..KKKKKKK..",
  ".KHHHHHHHK.",
  "KHFFFFFFFSK",
  "KHFFFFFFFSK",
  "KHFFFFFFFSK",
  "KHFFFFFFFSK",
  "KHFFFFFFFSK",
  "KHFFFFFFFSK",
  "KHFFFFFFFSK",
  ".KSSSSSSSK.",
  "..KKSSSKK..",
  "....KSK....",
  ".....K.....",
];

/** 7 × 7 glyphs of the compact badges: the same pictures with fewer texels. */
export const COMPACT_GLYPHS: Record<PlaceCategory | "add", readonly string[]> = {
  restaurant: [
    "K.K..K.",
    "K.K..KK",
    "KKK..KK",
    ".K...KK",
    ".K...K.",
    ".K...K.",
    ".K...K.",
  ],
  fast_food: [
    "..KKK..",
    ".KWKKK.",
    "KKKKWKK",
    ".......",
    "KKKKKKK",
    ".......",
    ".KKKKK.",
  ],
  cafe: [
    ".......",
    "KKKKK..",
    "KWWWKKK",
    "KKKKK.K",
    "KKKKKKK",
    ".KKK...",
    "KKKKKKK",
  ],
  bakery: [
    ".KKKKK.",
    "KWWWWWK",
    "KWWWWWK",
    ".KWWWK.",
    ".KWWWK.",
    ".KWWWK.",
    ".KKKKK.",
  ],
  butcher: [
    "...KKK.",
    "..KKKKK",
    "..KKKWK",
    "..KKKKK",
    "..KKKK.",
    ".KWK...",
    "KWK....",
  ],
  grocery: [
    "..KKK..",
    ".K...K.",
    "KKKKKKK",
    "KWKWKWK",
    ".KKKKK.",
    ".KWKWK.",
    "..KKK..",
  ],
  food_truck: [
    ".......",
    "KKKKK..",
    "KWWWKK.",
    "KKKKKWK",
    "KKKKKKK",
    ".K...K.",
    ".......",
  ],
  other: [
    "KKKKKKK",
    "KWKWKWK",
    ".K.K.K.",
    "K.....K",
    "K.KK..K",
    "K.KK..K",
    "KKKKKKK",
  ],
  add: [
    "...K...",
    "...K...",
    "...K...",
    "KKKKKKK",
    "...K...",
    "...K...",
    "...K...",
  ],
};

/** 5 × 6: the compact shield. */
const COMPACT_SHIELD = ["KKKKK", "KBBWK", "KWBWK", "KBWBK", ".KBK.", "..K.."];

/** 11 × 3 (in a 13 × 5 canvas): soft contact shadow under a marker's tip (1 light, 2 dark). */
const SHADOW = ["..1111111..", ".122222221.", "..1111111.."];
/** 7 × 3 (in a 9 × 5 canvas): under a compact badge. */
const COMPACT_SHADOW = [".11111.", "1222221", ".11111."];

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

/** Full badges, or the compact ones for coarse render pixels. */
export type BadgeSize = "full" | "compact";

/** How one size of badge is laid out in its square cell. */
interface BadgeFrame {
  /** K outline, H highlight, F fill, S shade */
  silhouette: readonly string[];
  /** square glyphs, drawn 2 texels in from the badge's top-left corner */
  glyphs: Record<PlaceCategory | "add", readonly string[]>;
  shield: readonly string[];
  /** side of the cell, texels */
  cell: number;
  /** the badge's top-left corner in the cell */
  x: number;
  y: number;
  /** the shield's top-left corner, from the badge's */
  shieldX: number;
  shieldY: number;
  /** contact shadow under the tip */
  shadow: readonly string[];
}

const FRAMES: Record<BadgeSize, BadgeFrame> = {
  full: { silhouette: BADGE, glyphs: GLYPHS, shield: SHIELD, cell: 25, x: 5, y: 4, shieldX: 12, shieldY: -3, shadow: SHADOW },
  compact: { silhouette: COMPACT_BADGE, glyphs: COMPACT_GLYPHS, shield: COMPACT_SHIELD, cell: 21, x: 5, y: 4, shieldX: 8, shieldY: -2, shadow: COMPACT_SHADOW },
};
export const BADGE_SIZES: readonly BadgeSize[] = ["full", "compact"];

/** Badge cell: 25 × 25 texels; the badge's top-left corner sits 5 texels in and 4 down. */
export const BADGE_CELL = FRAMES.full.cell;
/** Compact badge cell: 21 × 21 texels, the badge 5 texels in and 4 down. */
export const COMPACT_CELL = FRAMES.compact.cell;
/** Frames of the location halo's pulse. */
export const HALO_FRAMES = 8;
const HALO_CELL = 29;
const ATLAS_WIDTH = 256;
const GUTTER = 1;

const sizePrefix = (size: BadgeSize) => (size === "compact" ? "compact:" : "");

/** Name of the badge sprite of a category in a given state. */
export function badgeSpriteName(category: PlaceCategory | "add", style: BadgeStyle = {}, size: BadgeSize = "full"): string {
  return `${sizePrefix(size)}badge:${category}:${style.dim ? "dim" : "default"}${style.verified ? ":verified" : ""}${style.selected ? ":selected" : ""}`;
}
/** The night glow around a badge (larger around the selection ring). */
export const glowSpriteName = (selected: boolean, size: BadgeSize = "full") => `${sizePrefix(size)}glow${selected ? ":selected" : ""}`;
/** The contact shadow under a badge's tip. */
export const shadowSpriteName = (size: BadgeSize = "full") => `${sizePrefix(size)}shadow`;

export const GLOW_SPRITE = glowSpriteName(false);
export const GLOW_SELECTED_SPRITE = glowSpriteName(true);
export const SHADOW_SPRITE = shadowSpriteName();
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
  /** every texel of a mask of the canvas' size */
  fill(mask: { bits: Uint8Array }, c: Rgba, alpha = 1) {
    const m = mask.bits;
    for (let i = 0; i < m.length; i++) if (m[i]) this.set(i, c, alpha);
  }
}

/** Texels of a square `size²` cell (1 = inside). */
interface Mask {
  size: number;
  bits: Uint8Array;
}

function patternMask(pattern: readonly string[], ox: number, oy: number, size: number): Mask {
  const bits = new Uint8Array(size * size);
  pattern.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== ".") bits[(oy + y) * size + ox + x] = 1;
  });
  return { size, bits };
}

/** Texels around a mask (4-neighbourhood): growing a mask one texel at a time keeps it round. */
function ring({ size: S, bits: m }: Mask): Mask {
  const out = new Uint8Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (m[i]) continue;
      if ((x > 0 && m[i - 1]) || (x < S - 1 && m[i + 1]) || (y > 0 && m[i - S]) || (y < S - 1 && m[i + S])) out[i] = 1;
    }
  return { size: S, bits: out };
}

function union(first: Mask, ...more: Mask[]): Mask {
  const out = first.bits.slice();
  for (const m of more) for (let i = 0; i < out.length; i++) out[i]! |= m.bits[i]!;
  return { size: first.size, bits: out };
}

/** Shapes shared by every badge of a size: silhouette, selection ring, its edge, the glows. */
function badgeShapes(f: BadgeFrame) {
  const body = patternMask(f.silhouette, f.x, f.y, f.cell);
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

function badgeCanvas(f: BadgeFrame, shapes: Shapes, category: PlaceCategory | "add", style: BadgeStyle): Canvas {
  const c = new Canvas(f.cell, f.cell);
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
  c.draw(f.silhouette, body, f.x, f.y);
  c.draw(f.glyphs[category], { K: add ? C.saffronDark : ink, W: add ? C.white : dim ? C.dimCream : C.cream }, f.x + 2, f.y + 2);
  if (style.verified) c.draw(f.shield, { K: ink, B: C.shield, L: C.shieldLight, W: C.white }, f.x + f.shieldX, f.y + f.shieldY);
  return c;
}

/** Stepped halo around a badge's silhouette, white (tinted when drawn): the night glow. */
function glowCanvas(f: BadgeFrame, { base, steps }: Shapes["glow"]): Canvas {
  const c = new Canvas(f.cell, f.cell);
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
  const items: Item[] = [];
  const C = MARKER_COLORS;
  for (const size of BADGE_SIZES) {
    const f = FRAMES[size];
    const shapes = badgeShapes(f);
    const w = f.silhouette[0]!.length;
    const h = f.silhouette.length;
    // pivot: the bottom of the tip, in its middle; clicks: the badge and its tip
    const badge = { pivotX: f.x + w / 2, pivotTop: f.y + h, hitTop: [f.x, f.y, f.x + w, f.y + h] as const };
    for (const category of [...PLACE_CATEGORIES, "add" as const])
      for (const dim of [false, true])
        for (const verified of [false, true])
          for (const selected of [false, true]) {
            if (category === "add" && (dim || verified)) continue;
            const style = { dim, verified, selected };
            items.push({ name: badgeSpriteName(category, style, size), canvas: badgeCanvas(f, shapes, category, style), ...badge });
          }
    items.push({ name: glowSpriteName(false, size), canvas: glowCanvas(f, shapes.glow), ...badge });
    items.push({ name: glowSpriteName(true, size), canvas: glowCanvas(f, shapes.glowSelected), ...badge });
    // a transparent texel around the small sprites keeps their edges filtered alike
    const sw = f.shadow[0]!.length;
    const shadow = new Canvas(sw + 2, 5);
    shadow.draw(f.shadow, { "1": hex("#1c1208", 0.22), "2": hex("#1c1208", 0.42) }, 1, 1);
    items.push({ name: shadowSpriteName(size), canvas: shadow, pivotX: (sw + 2) / 2, pivotTop: 2.5, hitTop: [1, 1, sw + 1, 4] });
  }

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
