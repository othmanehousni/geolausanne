/**
 * Paths for things that move on their own (boats, birds): smooth curves
 * through waypoints, walked by distance. Pure, unit tested.
 */

export interface XZ {
  x: number;
  z: number;
}

export interface Path {
  /** dense points along the curve (a closed loop ends where it starts) */
  xs: Float64Array;
  zs: Float64Array;
  /** distance from the start to each point, metres */
  at: Float64Array;
  length: number;
  /** a loop: distances wrap around */
  closed: boolean;
}

/**
 * A smooth curve through `points` (centripetal Catmull-Rom, which never
 * overshoots into loops), sampled every `step` metres or so. A closed curve
 * goes back to the first point, as smooth there as anywhere else.
 */
export function smoothPath(points: readonly XZ[], step = 20, closed = false): Path {
  if (points.length < 2) throw new Error("a path needs two points");
  const xs: number[] = [];
  const zs: number[] = [];
  const n = points.length;
  const pt = (i: number) => (closed ? points[((i % n) + n) % n]! : points[Math.min(n - 1, Math.max(0, i))]!);
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = !closed && i === 0 ? mirror(pt(1), pt(0)) : pt(i - 1);
    const p1 = pt(i);
    const p2 = pt(i + 1);
    const p3 = !closed && i + 2 >= n ? mirror(pt(i), pt(i + 1)) : pt(i + 2);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < steps; k++) {
      const c = catmullRom(p0, p1, p2, p3, k / steps);
      xs.push(c.x);
      zs.push(c.z);
    }
  }
  const last = closed ? pt(0) : pt(n - 1);
  xs.push(last.x);
  zs.push(last.z);
  const at = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) at[i] = at[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!);
  return { xs: Float64Array.from(xs), zs: Float64Array.from(zs), at, length: at[at.length - 1]!, closed };
}

/** The point beyond `b` as far as `a` is before it (end tangents for the spline). */
function mirror(a: XZ, b: XZ): XZ {
  return { x: 2 * b.x - a.x, z: 2 * b.z - a.z };
}

/** Centripetal Catmull-Rom between p1 and p2 (Barry–Goldman pyramid). */
function catmullRom(p0: XZ, p1: XZ, p2: XZ, p3: XZ, u: number): XZ {
  const knot = (a: XZ, b: XZ, t: number) => t + Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: XZ, b: XZ, ta: number, tb: number): XZ => {
    const w = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

export interface PathPoint {
  x: number;
  z: number;
  /** direction of travel: radians, 0 = north (−z), clockwise (towards +x) */
  heading: number;
}

/** Position `s` metres along a path (clamped to its ends, or around a loop) into `out`. */
function positionAt(path: Path, s: number, out: { x: number; z: number }) {
  const { xs, zs, at } = path;
  const d = path.closed ? ((s % path.length) + path.length) % path.length : Math.min(path.length, Math.max(0, s));
  // binary search for the segment holding d
  let lo = 0;
  let hi = at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const seg = at[hi]! - at[lo]!;
  const w = seg > 0 ? (d - at[lo]!) / seg : 0;
  out.x = xs[lo]! + (xs[hi]! - xs[lo]!) * w;
  out.z = zs[lo]! + (zs[hi]! - zs[lo]!) * w;
}

const _a = { x: 0, z: 0 };
const _b = { x: 0, z: 0 };
/** Headings are measured over this distance either side, so they turn smoothly, not segment by segment. */
const HEADING_SPAN = 12;

/** The point `s` metres along a path (clamped to its ends, or around a loop), and the heading there. */
export function pointAt(path: Path, s: number, out: PathPoint = { x: 0, z: 0, heading: 0 }): PathPoint {
  positionAt(path, s, out);
  const from = path.closed ? s - HEADING_SPAN : Math.min(Math.max(0, s - HEADING_SPAN), path.length - 2 * HEADING_SPAN);
  positionAt(path, from, _a);
  positionAt(path, from + 2 * HEADING_SPAN, _b);
  out.heading = headingOf(_b.x - _a.x, _b.z - _a.z);
  return out;
}

/** Heading of a direction in the x/z plane: 0 = north (−z), π/2 = east (+x). */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}

/** Wrap an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t <= 0 ? t + 2 * Math.PI : t) - Math.PI;
}
