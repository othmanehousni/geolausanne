/**
 * Time of day for the 3D city: where the sun stands over Lausanne and what
 * light it gives.
 *
 * In day mode the sun follows Lausanne's real clock (cool morning, neutral
 * noon, golden evening), clamped to daylight: between dusk and dawn the
 * scene shows the light of the nearest daylight hour (the evening light until
 * midnight, the morning light after). Night mode (dark theme) is a moonlit
 * night whatever the hour. Everything here is pure and unit tested; the
 * Atmosphere component applies it once a minute.
 */

/** Lausanne-Flon (WGS84 degrees). */
export const LAUSANNE = { lat: 46.5197, lon: 6.6323 };

const RAD = Math.PI / 180;

export interface SunPosition {
  /** radians clockwise from north */
  azimuth: number;
  /** radians above the horizon */
  elevation: number;
  /** radians, negative in the morning, positive in the afternoon */
  hourAngle: number;
}

/**
 * Solar position (the NOAA / Astronomical Almanac low-precision formulas,
 * about 0.01 degrees between 1950 and 2050: far finer than a voxel shadow).
 */
export function solarPosition(ms: number, lat = LAUSANNE.lat, lon = LAUSANNE.lon): SunPosition {
  const n = ms / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000.0
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24;
  let h = (gmstHours * 15 + lon) * RAD - ra;
  h = Math.atan2(Math.sin(h), Math.cos(h)); // -pi..pi
  const phi = lat * RAD;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { azimuth: azimuth % (2 * Math.PI), elevation, hourAngle: h };
}

/** Lowest sun the day mode shows (degrees): golden, but still daylight. */
export const MIN_DAY_ELEVATION = 7;

/**
 * The instant whose light day mode shows at `ms`: `ms` itself in daylight,
 * otherwise the moment the sun is at {@link MIN_DAY_ELEVATION} on the same
 * side of midnight (evening light at night, morning light before dawn).
 */
export function daylightInstant(ms: number, minElevationDeg = MIN_DAY_ELEVATION): number {
  const min = minElevationDeg * RAD;
  const pos = solarPosition(ms);
  if (pos.elevation >= min) return ms;
  const HOUR = 3_600_000;
  // walk towards solar noon until the sun is high enough, then bisect
  const step = pos.hourAngle > 0 ? -HOUR : HOUR;
  let far = ms;
  let near = ms;
  for (let i = 0; i < 16; i++) {
    near = far;
    far += step;
    if (solarPosition(far).elevation >= min) break;
  }
  for (let i = 0; i < 30; i++) {
    const mid = (near + far) / 2;
    if (solarPosition(mid).elevation >= min) far = mid;
    else near = mid;
  }
  return Math.round(far);
}

export type RGB = [number, number, number];

/** Everything the scene's light and sky need (colours are sRGB, 0..1). */
export interface LightState {
  /** unit vector towards the sun (or moon), world axes x east, y up, z south */
  sunDir: [number, number, number];
  sunColor: RGB;
  /** directional light intensity (three.js units) */
  sunIntensity: number;
  skyColor: RGB;
  groundColor: RGB;
  hemiIntensity: number;
  zenith: RGB;
  horizon: RGB;
  fog: RGB;
  /** glow around the sun in the sky */
  glow: RGB;
}

export function sunDirection(azimuth: number, elevation: number): [number, number, number] {
  const c = Math.cos(elevation);
  return [c * Math.sin(azimuth), Math.sin(elevation), -c * Math.cos(azimuth)];
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

interface Key {
  elev: number;
  sun: RGB;
  sunI: number;
  sky: RGB;
  ground: RGB;
  hemiI: number;
  zenith: RGB;
  horizon: RGB;
  glow: RGB;
}

// Hand-tuned keys (pixel-art palette: warm key light, cool fill, hue-shifted
// shadows). Intensities give, in linear terms, tops ~0.8-1.0 x albedo, sunlit
// walls ~0.8-1.1 (warm at low sun), shaded walls ~0.45 with a blue cast and
// undersides ~0.17 (docs/decisions/0026-pixel-art-rendering-and-real-sky.md).
// Morning is cooler and pinker, evening golden.
const MORNING: Key[] = [
  { elev: 7, sun: hex("#ffc89a"), sunI: 2.2, sky: hex("#c9d6f2"), ground: hex("#7f6e62"), hemiI: 3.2, zenith: hex("#7d9fd4"), horizon: hex("#f2d5c4"), glow: hex("#ffd9b8") },
  { elev: 18, sun: hex("#ffe1c2"), sunI: 2.0, sky: hex("#cfdcf3"), ground: hex("#857464"), hemiI: 3.05, zenith: hex("#6b9ad6"), horizon: hex("#e3e6ea"), glow: hex("#fff0dc") },
  { elev: 35, sun: hex("#fff2df"), sunI: 1.6, sky: hex("#d3e0f4"), ground: hex("#887868"), hemiI: 2.95, zenith: hex("#5b95d7"), horizon: hex("#d3e5f3"), glow: hex("#fff8ea") },
  { elev: 60, sun: hex("#fff8ee"), sunI: 1.25, sky: hex("#d6e2f5"), ground: hex("#8a7a6a"), hemiI: 2.9, zenith: hex("#4f8fd6"), horizon: hex("#d6e8f5"), glow: hex("#fffaf0") },
];
const EVENING: Key[] = [
  { elev: 7, sun: hex("#ffa75e"), sunI: 2.3, sky: hex("#c9d3ee"), ground: hex("#7d6a5c"), hemiI: 3.2, zenith: hex("#6f86c4"), horizon: hex("#ffc98f"), glow: hex("#ffb870") },
  { elev: 18, sun: hex("#ffcd8f"), sunI: 2.0, sky: hex("#cfdbf2"), ground: hex("#857464"), hemiI: 3.0, zenith: hex("#6592d2"), horizon: hex("#f3dcc0"), glow: hex("#ffe0b0") },
  MORNING[2]!,
  MORNING[3]!,
];

export const NIGHT_LIGHT: LightState = {
  // the moon high in the south-south-west
  sunDir: sunDirection(205 * RAD, 38 * RAD),
  sunColor: hex("#9db4ff"),
  sunIntensity: 0.5,
  skyColor: hex("#5a6fa3"),
  groundColor: hex("#2a2526"),
  hemiIntensity: 0.95,
  zenith: hex("#060b1a"),
  horizon: hex("#1c2948"),
  fog: hex("#1a2440"),
  glow: hex("#2a3a66"),
};

// exact at both ends (k = 0 gives a, k = 1 gives b)
const lerp = (a: number, b: number, k: number) => a * (1 - k) + b * k;
const lerp3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Light of the day at instant `ms` (already clamped to daylight by the caller). */
export function dayLight(ms: number): LightState {
  const pos = solarPosition(ms);
  const elevDeg = Math.max(pos.elevation / RAD, MIN_DAY_ELEVATION);
  const keys = pos.hourAngle < 0 ? MORNING : EVENING;
  let i = 0;
  while (i < keys.length - 2 && elevDeg > keys[i + 1]!.elev) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const k = Math.min(1, Math.max(0, (elevDeg - a.elev) / (b.elev - a.elev)));
  const horizon = lerp3(a.horizon, b.horizon, k);
  return {
    sunDir: sunDirection(pos.azimuth, Math.max(pos.elevation, MIN_DAY_ELEVATION * RAD)),
    sunColor: lerp3(a.sun, b.sun, k),
    sunIntensity: lerp(a.sunI, b.sunI, k),
    skyColor: lerp3(a.sky, b.sky, k),
    groundColor: lerp3(a.ground, b.ground, k),
    hemiIntensity: lerp(a.hemiI, b.hemiI, k),
    zenith: lerp3(a.zenith, b.zenith, k),
    horizon,
    fog: horizon,
    glow: lerp3(a.glow, b.glow, k),
  };
}

/** Blend of two light states (day/night cross-fade). */
export function mixLight(a: LightState, b: LightState, k: number): LightState {
  const d = lerp3(a.sunDir, b.sunDir, k);
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return {
    sunDir: [d[0] / len, d[1] / len, d[2] / len],
    sunColor: lerp3(a.sunColor, b.sunColor, k),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, k),
    skyColor: lerp3(a.skyColor, b.skyColor, k),
    groundColor: lerp3(a.groundColor, b.groundColor, k),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, k),
    zenith: lerp3(a.zenith, b.zenith, k),
    horizon: lerp3(a.horizon, b.horizon, k),
    fog: lerp3(a.fog, b.fog, k),
    glow: lerp3(a.glow, b.glow, k),
  };
}

/**
 * How autumnal broadleaf trees look (0 summer .. 1): turning from late
 * September, at their peak in early November, bare-ish (kept green) after
 * mid-December. The orthophoto and the voxels are a summer picture; the
 * client tints a share of broadleaf crowns towards yellow and orange.
 */
export function autumn(ms: number): number {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const day = (ms - start) / 86_400_000; // 0 = 1 January
  const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return ramp(day, 262, 305) * (1 - ramp(day, 320, 350)); // 20 Sep -> 1 Nov peak -> fades by mid-December
}
