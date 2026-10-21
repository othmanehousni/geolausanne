/**
 * Camera orbits for scripted moves: the point looked at, a distance and two
 * angles. Moves interpolate these rather than camera positions, so the
 * camera turns around the target instead of cutting across it (a straight
 * line from south to north passes right over the target).
 */
import * as THREE from "three";

export interface Orbit {
  target: THREE.Vector3;
  distance: number;
  /** radians, 0 = looking north (camera south of the target) */
  azimuth: number;
  /** radians from the zenith */
  polar: number;
}

/** Long flights (search results, home): slow start and end. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Short steps (keyboard, toolbar): respond at once, settle gently. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Signed shortest turn from angle `a` to angle `b`, in [-π, π]. */
export function shortestAngle(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

export function orbitOf(position: THREE.Vector3, target: THREE.Vector3): Orbit {
  _spherical.setFromVector3(_offset.subVectors(position, target));
  return { target: target.clone(), distance: _spherical.radius, azimuth: _spherical.theta, polar: _spherical.phi };
}

export function copyOrbit(o: Orbit): Orbit {
  return { ...o, target: o.target.clone() };
}

export function orbitPosition(o: Orbit, out = new THREE.Vector3()): THREE.Vector3 {
  const s = Math.sin(o.polar);
  return out.set(
    o.target.x + o.distance * s * Math.sin(o.azimuth),
    o.target.y + o.distance * Math.cos(o.polar),
    o.target.z + o.distance * s * Math.cos(o.azimuth),
  );
}

/** The orbit `k` (0..1) of the way from `a` to `b`, turning the short way round. */
export function lerpOrbit(a: Orbit, b: Orbit, k: number, out: Orbit): Orbit {
  out.target.lerpVectors(a.target, b.target, k);
  out.distance = a.distance + (b.distance - a.distance) * k;
  out.azimuth = a.azimuth + shortestAngle(a.azimuth, b.azimuth) * k;
  out.polar = a.polar + (b.polar - a.polar) * k;
  return out;
}
