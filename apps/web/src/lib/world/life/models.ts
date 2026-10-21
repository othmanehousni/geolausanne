/**
 * Voxel models of the things that move: boats (bow towards −z, the water
 * line at y = 0) and a bird (wings along x, beak towards −z). Metres.
 */
import type { VoxelBox } from "./voxel-model";

const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, extra: Partial<VoxelBox> = {}): VoxelBox => ({
  x,
  y,
  z,
  w,
  h,
  d,
  color,
  ...extra,
});

const WHITE = "#f4f1e8";
const WINDOW = "#34414c";
const LIT = "#ffc477";
const RED = "#d52b1e";

/** Navigation lights, only seen at night: red to port, green to starboard, white on the mast. */
function lights(halfBeam: number, y: number, z: number, mastY: number, mastZ: number): VoxelBox[] {
  return [
    box(-halfBeam, y, z, 0.9, 0.9, 0.9, "#7a1b16", { glow: "#ff3b2f" }),
    box(halfBeam, y, z, 0.9, 0.9, 0.9, "#1d5e2c", { glow: "#3dff6a" }),
    box(0, mastY, mastZ, 0.9, 0.9, 0.9, "#d9d9d9", { glow: "#fff6dd" }),
  ];
}

/**
 * A Belle Époque paddle steamer of the CGN (La Suisse, Savoie, Simplon):
 * white hull with a gilded line, two decks of saloons, paddle boxes, a
 * yellow funnel with a black top, the Swiss flag at the stern.
 */
export function steamerModel(): VoxelBox[] {
  return [
    // hull, stepped to a point at the bow, dark below the water line
    box(0, -0.6, 2, 8, 1.6, 58, "#2c3a33"),
    box(0, 1.1, 2, 8.2, 2.2, 58, WHITE),
    box(0, 1.1, -29.5, 6.4, 2.2, 5, WHITE),
    box(0, 1.1, -33.5, 3.6, 2.2, 3, WHITE),
    box(0, 1.3, 32.5, 7, 2.6, 3, WHITE),
    box(0, 2.05, 2, 8.3, 0.35, 58, "#c9a243"),
    // saloons with their windows
    box(0, 3.4, 4, 7, 2.4, 44, WHITE),
    box(0, 3.5, 4, 7.15, 0.8, 42, WINDOW, { glow: LIT }),
    box(0, 5.7, 6, 6, 2.2, 22, WHITE),
    box(0, 5.8, 6, 6.15, 0.7, 20, WINDOW, { glow: LIT }),
    // bridge across the paddle boxes, wheelhouse
    box(0, 7.1, -3, 12, 0.5, 3, WHITE),
    box(0, 7.9, -3, 3.4, 1.8, 3, WHITE),
    box(0, 8.1, -4.55, 3.2, 0.6, 0.15, WINDOW, { glow: LIT }),
    // paddle boxes
    box(-5.7, 2.9, -3, 3.4, 3.8, 9, WHITE),
    box(5.7, 2.9, -3, 3.4, 3.8, 9, WHITE),
    box(-7.45, 2.9, -3, 0.15, 2.2, 6, "#c9a243"),
    box(7.45, 2.9, -3, 0.15, 2.2, 6, "#c9a243"),
    // funnel
    box(0, 9.1, 3, 2.4, 5.6, 2.4, "#e7bb4f"),
    box(0, 12.4, 3, 2.5, 1.2, 2.5, "#1d1d1d"),
    // masts and flags
    box(0, 7.5, -24, 0.35, 8, 0.35, "#6b5a45"),
    box(0, 11.2, -23.2, 0.1, 0.9, 1.4, RED),
    box(0, 5.2, 33, 0.3, 4.5, 0.3, "#6b5a45"),
    box(0, 6.6, 34.2, 0.12, 1.3, 2, RED),
    box(0, 6.6, 34.2, 0.16, 0.35, 1.0, "#ffffff"),
    box(0, 6.6, 34.2, 0.16, 0.9, 0.3, "#ffffff"),
    ...lights(4.6, 4.6, -6, 11.9, -24),
  ];
}

/** The modern motor ship of the Évian line: white, a navy band, two decks of windows. */
export function shuttleModel(): VoxelBox[] {
  return [
    box(0, -0.6, 1, 9.6, 1.6, 40, "#2a3442"),
    box(0, 1.0, 1, 9.8, 2, 40, WHITE),
    box(0, 1.0, -20.5, 7, 2, 4, WHITE),
    box(0, 1.0, -23.5, 3.6, 2, 2.6, WHITE),
    box(0, 0.6, 1, 9.95, 0.6, 40, "#1f3b66"),
    box(0, 3.2, 3, 8.6, 2.4, 30, WHITE),
    box(0, 3.3, 3, 8.75, 0.9, 28, WINDOW, { glow: LIT }),
    box(0, 5.4, 5, 7.4, 2, 18, WHITE),
    box(0, 5.5, 5, 7.55, 0.8, 16, WINDOW, { glow: LIT }),
    box(0, 7.1, -2, 4, 1.4, 4, WHITE),
    box(0, 7.2, -4.05, 3.6, 0.6, 0.15, WINDOW, { glow: LIT }),
    box(0, 8.2, 8, 1.4, 1.6, 2.2, "#c8ccd0"),
    box(0, 4.2, 21.5, 0.25, 4, 0.25, "#6b6b6b"),
    box(0, 5.5, 22.4, 0.12, 1.1, 1.6, RED),
    ...lights(5, 3, -4, 9.6, -2),
  ];
}

/** A small yacht: white hull, mast, a stepped mainsail and a jib. */
export function sailModel(): VoxelBox[] {
  return [
    box(0, 0.3, 0.3, 2.6, 1.1, 7, "#fbfbf8"),
    box(0, 0.3, -3.9, 1.6, 1.1, 1.6, "#fbfbf8"),
    box(0, 0.75, 0.3, 2.65, 0.2, 7, "#22356b"),
    box(0, 1.1, 1.5, 1.6, 0.6, 2.2, "#e8e4d8"),
    box(0, 6.2, -0.6, 0.18, 11, 0.18, "#d8d8d8"),
    // mainsail, in steps
    box(0, 3.2, 0.95, 0.1, 3, 2.9, "#fdfdf9"),
    box(0, 5.9, 0.7, 0.1, 2.6, 2.4, "#fdfdf9"),
    box(0, 8.3, 0.4, 0.1, 2.4, 1.6, "#fdfdf9"),
    box(0, 10.4, 0.1, 0.1, 1.8, 0.9, "#fdfdf9"),
    // jib
    box(0, 3.4, -2.2, 0.1, 3.4, 2.4, "#f3efe4"),
    box(0, 6.4, -1.5, 0.1, 2.8, 1.2, "#f3efe4"),
    box(0, 11.8, -0.6, 0.5, 0.5, 0.5, "#dddddd", { glow: "#fff6dd" }),
  ];
}

/** A runabout: white with a red deck, a windscreen. */
export function motorModel(): VoxelBox[] {
  return [
    box(0, 0.2, 0.2, 2.5, 0.9, 6, "#f7f7f4"),
    box(0, 0.2, -3.3, 1.5, 0.9, 1.2, "#f7f7f4"),
    box(0, 0.75, 0.6, 2.4, 0.25, 5, "#c22a2a"),
    box(0, 1.15, -0.6, 2.2, 0.6, 0.2, "#3d4b57"),
    box(0, 1.0, 2.6, 0.5, 0.5, 0.5, "#dddddd", { glow: "#fff6dd" }),
  ];
}

/**
 * A gull-sized bird (1.3 m span) in voxels: body, head, tail, and wings in
 * two parts each. `part` is −1 for the left wing, +1 for the right; the
 * wingtips are darker.
 */
export function birdModel(): VoxelBox[] {
  // chunky on purpose: seen from above at a dozen pixels, thin wings vanish
  return [
    box(0, 0, 0, 0.26, 0.2, 0.62, "#ffffff"),
    box(0, 0.06, -0.38, 0.17, 0.16, 0.16, "#ffffff"),
    box(0, 0.05, -0.5, 0.07, 0.06, 0.09, "#e3a72f"),
    box(0, 0.02, 0.38, 0.24, 0.06, 0.2, "#e8e8e8"),
    box(-0.34, 0.02, -0.02, 0.44, 0.08, 0.36, "#cfd3d8", { part: -1 }),
    box(0.34, 0.02, -0.02, 0.44, 0.08, 0.36, "#cfd3d8", { part: 1 }),
    box(-0.67, 0.02, 0.02, 0.24, 0.07, 0.26, "#26282b", { part: -1 }),
    box(0.67, 0.02, 0.02, 0.24, 0.07, 0.26, "#26282b", { part: 1 }),
  ];
}

/**
 * A V of foam behind a boat, its tip at the stern (z = 0), trailing towards
 * +z: two arms at the Kelvin angle (19.5°) and a churned middle, fading in
 * steps (alpha in the fourth colour channel). Unit length: scaled by the
 * length of the wake in both directions, so the angle holds.
 */
export function wakeQuads(): { positions: number[]; colors: number[]; indices: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number, w: number, a0: number, a1: number) => {
    const v = positions.length / 3;
    // a strip from (x0, z0) to (x1, z1), w wide
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (w / 2);
    const nz = (dx / len) * (w / 2);
    positions.push(x0 - nx, 0, z0 - nz, x0 + nx, 0, z0 + nz, x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz);
    for (const a of [a0, a0, a1, a1]) colors.push(1, 1, 1, a);
    // counter-clockwise seen from above: the foam faces the sky
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };
  // stepped segments, each a little fainter: pixel-art foam
  const steps = 6;
  const spread = Math.tan((19.5 * Math.PI) / 180);
  for (let k = 0; k < steps; k++) {
    const z0 = k / steps;
    const z1 = (k + 1) / steps;
    const a = 0.6 * (1 - k / steps) ** 1.3;
    const b = 0.6 * (1 - (k + 1) / steps) ** 1.3;
    quad(-0.02 - z0 * spread, z0, -0.02 - z1 * spread, z1, 0.022, a, b);
    quad(0.02 + z0 * spread, z0, 0.02 + z1 * spread, z1, 0.022, a, b);
    // the churned water right behind the hull
    quad(0, z0 * 0.55, 0, z1 * 0.55, 0.05 * (1 - z0 * 0.5), a * 0.75, b * 0.75);
  }
  return { positions, colors, indices };
}
