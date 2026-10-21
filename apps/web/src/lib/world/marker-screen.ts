/**
 * Screen-space maths of the map markers: projection, size, draw order and
 * picking. The markers are drawn by a vertex shader (sprite-batch.ts), so
 * three's raycaster cannot hit them: a pointer is tested against the
 * rectangles they occupy on screen, front-most first, exactly as drawn.
 * Pure (no three.js), unit tested.
 */
import type { AtlasSprite } from "./marker-atlas";

export interface ScreenPoint {
  /** CSS pixels from the canvas' top-left corner */
  x: number;
  y: number;
  /** distance in front of the camera along its axis (clip w): larger is farther */
  depth: number;
}

/**
 * Project a world point with a projection × view matrix (column-major, as
 * three's `Matrix4.elements`) into CSS pixels of a `width × height` canvas.
 * False when the point is behind the camera (or on its plane).
 */
export function projectToScreen(m: ArrayLike<number>, x: number, y: number, z: number, width: number, height: number, out: ScreenPoint): boolean {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (w <= 1e-3) return false;
  const cx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  const cy = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  out.x = (cx * 0.5 + 0.5) * width;
  out.y = (0.5 - cy * 0.5) * height;
  out.depth = w;
  return true;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * CSS pixels per texel of a marker seen from `distance` metres, drawn at
 * `pxPerCss` render pixels per CSS pixel: 2 up close (a 30 px badge), easing
 * to 1.5 far away (23 px). Where render pixels are large (a 1× screen, or a
 * canvas rendered at reduced resolution and upscaled) a texel covers a whole
 * number of them, so the pixel art stays crisp; the size then stays put.
 */
export function markerTexelSize(distance: number, pxPerCss: number, scale = 1): number {
  if (pxPerCss < 1.25) return Math.max(1, Math.round(2 * scale * pxPerCss)) / pxPerCss;
  return (2 - 0.5 * smoothstep(500, 4000, distance)) * scale;
}

/**
 * The clickable rectangle of a sprite whose pivot is at (`x`, `y`) on
 * screen, `texel` CSS pixels per texel, raised by `lift` CSS pixels:
 * [left, top, right, bottom] in CSS pixels.
 */
export function spriteHitRect(
  x: number,
  y: number,
  sprite: AtlasSprite,
  texel: number,
  lift: number,
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  const [x0, y0, x1, y1] = sprite.hit;
  out[0] = x + (x0 - sprite.pivotX) * texel;
  out[1] = y - lift - (y1 - sprite.pivotY) * texel;
  out[2] = x + (x1 - sprite.pivotX) * texel;
  out[3] = y - lift - (y0 - sprite.pivotY) * texel;
  return out;
}

/**
 * Hit rectangles of the markers in drawing order (back to front). Filled
 * every frame without allocating; `pick` answers the front-most one under a
 * point.
 */
export class ScreenHits<T> {
  private rects: Float32Array;
  private ids: T[] = [];
  count = 0;

  constructor(capacity = 64) {
    this.rects = new Float32Array(capacity * 4);
  }

  clear() {
    this.count = 0;
  }

  /** Add a rectangle on top of the previous ones (skipped when it is entirely off a `width × height` screen). */
  add(id: T, rect: readonly [number, number, number, number], width: number, height: number) {
    const [l, t, r, b] = rect;
    if (r < 0 || b < 0 || l > width || t > height) return;
    if (this.count * 4 >= this.rects.length) {
      const grown = new Float32Array(this.rects.length * 2);
      grown.set(this.rects);
      this.rects = grown;
    }
    const o = this.count * 4;
    this.rects[o] = l;
    this.rects[o + 1] = t;
    this.rects[o + 2] = r;
    this.rects[o + 3] = b;
    this.ids[this.count] = id;
    this.count++;
  }

  /** The front-most marker whose rectangle, grown by `pad` CSS pixels, contains (`x`, `y`); null if none. */
  pick(x: number, y: number, pad = 0): T | null {
    for (let i = this.count - 1; i >= 0; i--) {
      const o = i * 4;
      if (x >= this.rects[o]! - pad && x <= this.rects[o + 2]! + pad && y >= this.rects[o + 1]! - pad && y <= this.rects[o + 3]! + pad) return this.ids[i]!;
    }
    return null;
  }
}

let keys = new Float64Array(256);
/** a depth beyond anything on screen, so that sort keys stay positive */
const FAR_KEY = 1e6;

/**
 * Drawing order: farthest first (painter's order, the markers are drawn on
 * top of the city without depth test), then the selected marker, then the
 * hovered one, so that what is pointed at is never hidden. Sorted natively:
 * each key packs the depth (to 1/64 m) and the index.
 */
export function drawOrder(depths: ArrayLike<number>, selected: number, hovered: number, out: number[] = []): number[] {
  out.length = 0;
  const n = depths.length;
  if (n > 4096) throw new Error("too many markers to order");
  if (keys.length < n) keys = new Float64Array(Math.max(n, keys.length * 2));
  let k = 0;
  for (let i = 0; i < n; i++) if (i !== selected && i !== hovered) keys[k++] = Math.round((FAR_KEY - depths[i]!) * 64) * 4096 + i;
  const sorted = keys.subarray(0, k).sort();
  for (let j = 0; j < k; j++) out.push(sorted[j]! % 4096);
  if (selected >= 0 && selected < n) out.push(selected);
  if (hovered >= 0 && hovered < n && hovered !== selected) out.push(hovered);
  return out;
}

/**
 * Height of a selected marker's one bounce (CSS pixels) `t` seconds after
 * it was chosen: a hop and a small rebound, 0.45 s in all.
 */
export function selectBounce(t: number): number {
  if (t <= 0 || t >= 0.45) return 0;
  if (t < 0.16) {
    const k = t / 0.16;
    return 12 * (1 - (1 - k) * (1 - k));
  }
  if (t < 0.3) {
    const k = (t - 0.16) / 0.14;
    return 12 * (1 - k * k);
  }
  return 3 * Math.sin((Math.PI * (t - 0.3)) / 0.15);
}
