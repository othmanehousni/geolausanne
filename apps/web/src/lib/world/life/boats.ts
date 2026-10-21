/**
 * Boats on Lake Geneva: CGN paddle steamers and the Évian shuttle from
 * Ouchy, sailing boats and a motor boat in the bay. Each sails a closed
 * loop through its stops, stopping at each berth, on a timetable derived
 * from the clock, so a boat is where its schedule puts it. Pure, unit
 * tested; the routes were checked against the lake of the terrain model
 * (water at world y = 0, see docs/pipeline/horizon.md): every boat's hull
 * stays over water all along its loop.
 *
 * World frame: x = E − 2 538 000, z = 1 152 000 − N (north is −z). In the
 * terrain model Ouchy's pier ends around (−280, 1 330), Évian's pier is
 * around (−3 350, 12 600), Vevey's quay around (16 200, 6 600) and Morges'
 * breakwater around (−10 000, 800).
 */
import { pointAt, smoothPath, type Path, type PathPoint, type XZ } from "./paths";

export type BoatKind = "steamer" | "shuttle" | "sail" | "motor";

/** Hull dimensions in metres (the models are built to these). */
export const BOAT_SIZE: Record<BoatKind, { length: number; beam: number }> = {
  // Belle Époque paddle steamer (La Suisse, Savoie, Simplon: 68–78 m)
  steamer: { length: 70, beam: 15 },
  // modern motor ship on the Lausanne–Évian line
  shuttle: { length: 46, beam: 10 },
  sail: { length: 9, beam: 3 },
  motor: { length: 7, beam: 2.6 },
};

export interface BoatRoute {
  id: string;
  kind: BoatKind;
  /** a closed loop, starting at the first stop (the last point joins the first) */
  points: readonly XZ[];
  /** indices into `points` where the boat stops (the first one is 0) */
  stops: readonly number[];
  /** cruising speed, m/s */
  speed: number;
  /** time at each stop, s */
  dwell: number;
  /** shifts the timetable, s */
  offset: number;
}

/** Ouchy's berths: off the pier's tip, along the quay east of it, in the bay west of it. */
const OUCHY_PIER: XZ = { x: -205, z: 1356 };
const OUCHY_QUAY: XZ = { x: 200, z: 1140 };
const OUCHY_BAY: XZ = { x: -630, z: 1062 };

/** The Lausanne–Évian line: one boat leaves each shore every 35 minutes or so. */
const EVIAN: readonly XZ[] = [
  OUCHY_PIER,
  { x: -60, z: 1352 },
  { x: 60, z: 1440 },
  { x: 40, z: 1700 },
  { x: -2600, z: 11300 },
  { x: -3020, z: 12330 },
  { x: -3220, z: 12535 },
  // Évian's pier
  { x: -3360, z: 12555 },
  { x: -3560, z: 12530 },
  { x: -3700, z: 12380 },
  { x: -3620, z: 12100 },
  { x: -820, z: 2000 },
  { x: -560, z: 1545 },
  { x: -390, z: 1418 },
];

export const LAKE_ROUTES: readonly BoatRoute[] = [
  { id: "evian-1", kind: "shuttle", points: EVIAN, stops: [0, 7], speed: 7.2, dwell: 300, offset: 0 },
  { id: "evian-2", kind: "shuttle", points: EVIAN, stops: [0, 7], speed: 7.2, dwell: 300, offset: 2127 },
  {
    // Ouchy ⇄ Vevey along Lavaux, a Belle Époque paddle steamer
    id: "lavaux",
    kind: "steamer",
    points: [
      OUCHY_QUAY,
      { x: 60, z: 1150 },
      { x: -20, z: 1230 },
      { x: 10, z: 1360 },
      { x: 200, z: 1460 },
      { x: 600, z: 1560 },
      { x: 2400, z: 1800 },
      { x: 4300, z: 2300 },
      { x: 5900, z: 3150 },
      { x: 7400, z: 3900 },
      { x: 9000, z: 3950 },
      { x: 10700, z: 4750 },
      { x: 12700, z: 5450 },
      { x: 14700, z: 5900 },
      { x: 15680, z: 6530 },
      { x: 16040, z: 6640 },
      // Vevey's pier
      { x: 16230, z: 6650 },
      { x: 16420, z: 6730 },
      { x: 16520, z: 6900 },
      { x: 16300, z: 7100 },
      { x: 14600, z: 6450 },
      { x: 12600, z: 5950 },
      { x: 10600, z: 5250 },
      { x: 8900, z: 4450 },
      { x: 7300, z: 4400 },
      { x: 5700, z: 3650 },
      { x: 4200, z: 2800 },
      { x: 2400, z: 2250 },
      { x: 1000, z: 1500 },
      { x: 640, z: 1340 },
      { x: 400, z: 1215 },
    ],
    stops: [0, 16],
    speed: 6.8,
    dwell: 420,
    offset: 1500,
  },
  {
    // a cruise westwards, past Vidy and Saint-Sulpice, turning off Morges
    id: "morges",
    kind: "steamer",
    points: [
      OUCHY_BAY,
      { x: -540, z: 1090 },
      { x: -520, z: 1200 },
      { x: -560, z: 1400 },
      { x: -800, z: 1560 },
      { x: -1600, z: 1650 },
      { x: -3000, z: 1500 },
      { x: -4400, z: 1200 },
      { x: -6000, z: 1600 },
      { x: -7600, z: 1400 },
      { x: -9000, z: 1250 },
      { x: -9600, z: 1300 },
      { x: -9800, z: 1550 },
      { x: -9500, z: 1800 },
      { x: -7600, z: 1750 },
      { x: -6000, z: 1950 },
      { x: -4400, z: 1600 },
      { x: -3000, z: 1850 },
      { x: -1600, z: 1900 },
      { x: -1000, z: 1500 },
      { x: -800, z: 1250 },
      { x: -720, z: 1100 },
    ],
    stops: [0],
    speed: 6.5,
    dwell: 480,
    offset: 3100,
  },
  // sailing boats tacking in the bay of Ouchy and off Vidy
  { id: "sail-1", kind: "sail", points: ellipse(-900, 1900, 520, 260, 0.3), stops: [], speed: 2.6, dwell: 0, offset: 0 },
  { id: "sail-2", kind: "sail", points: ellipse(-1800, 1650, 420, 220, -0.2), stops: [], speed: 2.2, dwell: 0, offset: 900 },
  { id: "sail-3", kind: "sail", points: ellipse(600, 2050, 600, 300, 0.1), stops: [], speed: 2.9, dwell: 0, offset: 300 },
  { id: "sail-4", kind: "sail", points: ellipse(-300, 2600, 380, 240, 0.6), stops: [], speed: 2.4, dwell: 0, offset: 1700 },
  // a motor boat
  { id: "motor-1", kind: "motor", points: ellipse(1300, 1650, 700, 260, -0.15), stops: [], speed: 9, dwell: 0, offset: 0 },
];

/** Points of an ellipse (a closed loop starting on its long axis). */
function ellipse(cx: number, cz: number, rx: number, rz: number, tilt: number, n = 10): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const z = Math.sin(a) * rz;
    out.push({ x: cx + x * Math.cos(tilt) - z * Math.sin(tilt), z: cz + x * Math.sin(tilt) + z * Math.cos(tilt) });
  }
  return out;
}

/** A route ready to be sailed: its smooth loop, where it stops and its timetable. */
export interface Voyage {
  route: BoatRoute;
  path: Path;
  /** distance along the loop of each stop, increasing; the loop ends where it began */
  stopsAt: number[];
  /** seconds for one full round: legs and stops */
  period: number;
  /** each leg: start time in the round, start distance, length, duration */
  legs: { start: number; from: number; length: number; duration: number }[];
}

/** Acceleration when leaving and stopping at a berth, m/s² (a big boat needs about 500 m). */
const ACCEL = 0.05;

/** Duration of a leg of `length` metres at cruising speed `v` with gentle starts and stops. */
export function legDuration(length: number, v: number, accel = ACCEL): number {
  const ramp = (v * v) / (2 * accel);
  if (length >= 2 * ramp) return length / v + v / accel;
  // too short to reach cruising speed: accelerate half way, slow down the other half
  return 2 * Math.sqrt(length / accel);
}

/** Distance covered `t` seconds into a leg (trapezoidal speed profile). */
export function legDistance(t: number, length: number, v: number, accel = ACCEL): number {
  const duration = legDuration(length, v, accel);
  const tt = Math.min(duration, Math.max(0, t));
  const ramp = (v * v) / (2 * accel);
  if (length >= 2 * ramp) {
    const tr = v / accel;
    if (tt < tr) return 0.5 * accel * tt * tt;
    if (tt > duration - tr) return length - 0.5 * accel * (duration - tt) ** 2;
    return ramp + v * (tt - tr);
  }
  const half = duration / 2;
  return tt < half ? 0.5 * accel * tt * tt : length - 0.5 * accel * (duration - tt) ** 2;
}

export function voyage(route: BoatRoute): Voyage {
  // the smooth loop, and where each stop landed on it
  const path = smoothPath(route.points, 10, true);
  const stopsAt = route.stops.map((i) => nearestDistance(path, route.points[i]!));
  const legs: Voyage["legs"] = [];
  let clock = 0;
  if (stopsAt.length === 0) {
    // sailing round and round without stopping
    const duration = path.length / route.speed;
    legs.push({ start: 0, from: 0, length: path.length, duration });
    return { route, path, stopsAt, period: duration, legs };
  }
  for (let k = 0; k < stopsAt.length; k++) {
    clock += route.dwell;
    const from = stopsAt[k]!;
    const to = k + 1 < stopsAt.length ? stopsAt[k + 1]! : path.length;
    const length = to - from;
    const duration = legDuration(length, route.speed);
    legs.push({ start: clock, from, length, duration });
    clock += duration;
  }
  return { route, path, stopsAt, period: clock, legs };
}

/** Distance along a path of its point nearest to `p`. */
function nearestDistance(path: Path, p: XZ): number {
  let best = Infinity;
  let at = 0;
  for (let i = 0; i < path.xs.length; i++) {
    const d = Math.hypot(path.xs[i]! - p.x, path.zs[i]! - p.z);
    if (d < best) {
      best = d;
      at = path.at[i]!;
    }
  }
  return at;
}

export interface BoatState extends PathPoint {
  /** current speed, m/s (0 when moored) */
  speed: number;
}

/** Where a boat is at `time` seconds (any clock; the timetable repeats every period). */
export function boatAt(v: Voyage, time: number, out: BoatState = { x: 0, z: 0, heading: 0, speed: 0 }): BoatState {
  const { route, path } = v;
  const t = (((time + route.offset) % v.period) + v.period) % v.period;
  let s = 0;
  let speed = 0;
  if (v.stopsAt.length === 0) {
    s = (t / v.period) * path.length;
    speed = route.speed;
  } else {
    // moored at the first stop until the first leg starts
    s = v.stopsAt[0]!;
    for (const leg of v.legs) {
      if (t < leg.start) break;
      const into = t - leg.start;
      if (into >= leg.duration) {
        s = leg.from + leg.length;
        continue;
      }
      s = leg.from + legDistance(into, leg.length, route.speed);
      const ds = legDistance(into + 0.5, leg.length, route.speed) - legDistance(into - 0.5, leg.length, route.speed);
      speed = Math.max(0, ds);
      break;
    }
  }
  pointAt(path, s, out);
  out.speed = speed;
  return out;
}
