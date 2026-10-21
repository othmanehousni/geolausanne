/**
 * Small flocks circling over Lausanne's parks (pigeons) and along the lake
 * at Ouchy and Vidy (gulls). A flock wanders slowly around its place; its
 * birds keep together, a little apart, each with its own wing beat. Pure,
 * unit tested.
 */
import { headingOf, type XZ } from "./paths";

export type BirdKind = "gull" | "pigeon";

export interface Flock {
  id: string;
  kind: BirdKind;
  /** the place it circles over (world x/z) */
  centre: XZ;
  /** mean radius of its loop, m */
  radius: number;
  /** birds in the flock (at most) */
  count: number;
  /** flying height above the ground (or the lake), m */
  height: number;
  /** angular speed around the loop, rad/s; the sign sets the direction */
  turn: number;
  /** over the lake: the ground is the water at y = 0 */
  overWater?: boolean;
}

/**
 * World x = E − 2 538 000, z = 1 152 000 − N. In order of priority: a
 * smaller budget keeps the first flocks (over the centre and Ouchy).
 */
export const FLOCKS: readonly Flock[] = [
  { id: "montbenon", kind: "pigeon", centre: { x: -296, z: -479 }, radius: 70, count: 7, height: 34, turn: 0.13 },
  { id: "ouchy", kind: "gull", centre: { x: -60, z: 1300 }, radius: 170, count: 7, height: 16, turn: 0.06, overWater: true },
  { id: "cathedral", kind: "pigeon", centre: { x: 373, z: -672 }, radius: 55, count: 5, height: 62, turn: 0.15 },
  { id: "mon-repos", kind: "pigeon", centre: { x: 870, z: -444 }, radius: 90, count: 6, height: 42, turn: -0.11 },
  { id: "milan", kind: "pigeon", centre: { x: -866, z: 460 }, radius: 80, count: 6, height: 30, turn: -0.12 },
  { id: "vidy", kind: "gull", centre: { x: -3000, z: 900 }, radius: 220, count: 6, height: 14, turn: -0.05, overWater: true },
  { id: "hermitage", kind: "pigeon", centre: { x: 619, z: -1425 }, radius: 75, count: 5, height: 40, turn: 0.12 },
];

export interface BirdPose {
  x: number;
  /** height above the flock's ground */
  y: number;
  z: number;
  /** direction of flight: radians, 0 = north, towards +x */
  heading: number;
  /** roll into the turn, radians */
  bank: number;
  /** 0 = gliding, 1 = flapping */
  flap: number;
}

/** A stable pseudo-random number in [0, 1) for an integer. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Pose of bird `i` of a flock at `t` seconds. The flock's centre drifts on a
 * slow Lissajous curve; each bird flies its own slightly different circle,
 * a few degrees behind the previous one, rising and sinking gently.
 */
export function birdPose(f: Flock, i: number, t: number, out: BirdPose = { x: 0, y: 0, z: 0, heading: 0, bank: 0, flap: 0 }): BirdPose {
  const seed = f.id.length * 7.13 + f.centre.x * 0.001;
  const r1 = hash01(i * 3 + 1 + Math.round(f.centre.x));
  const r2 = hash01(i * 3 + 2 + Math.round(f.centre.z));
  const cx = f.centre.x + 0.35 * f.radius * Math.sin(0.031 * t + seed);
  const cz = f.centre.z + 0.35 * f.radius * Math.cos(0.023 * t + seed * 2);
  const radius = f.radius * (0.82 + 0.36 * r1) * (1 + 0.15 * Math.sin(0.11 * t + i));
  const angle = f.turn * t - i * 0.16 * Math.sign(f.turn) + r2 * 0.1;
  out.x = cx + radius * Math.cos(angle);
  out.z = cz + radius * Math.sin(angle);
  out.y = f.height + (r1 - 0.5) * 10 + 4 * Math.sin(0.4 * t + i * 1.7);
  // tangent of the circle in the direction of travel
  const s = Math.sign(f.turn) || 1;
  out.heading = headingOf(-Math.sin(angle) * s, Math.cos(angle) * s);
  // lean into the turn: tan(bank) = v² / (r g)
  const v = Math.abs(f.turn) * radius;
  out.bank = Math.atan((v * v) / (radius * 9.81)) * s;
  // gulls mostly glide; pigeons flap with short glides
  const phase = 0.5 + 0.5 * Math.sin(t * (f.kind === "gull" ? 0.45 : 0.9) + i * 2.3);
  out.flap = f.kind === "gull" ? (phase > 0.8 ? 1 : 0) : phase > 0.25 ? 1 : 0;
  return out;
}

/** Wing beats per second. */
export const FLAP_RATE: Record<BirdKind, number> = { gull: 2.6, pigeon: 5.2 };
