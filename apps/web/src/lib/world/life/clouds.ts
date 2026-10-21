/**
 * A few slow voxel clouds drifting from the south-west (the "vent" of Lake
 * Geneva) high over the city: each is a blob of 40 m voxels with a flat
 * base. They repeat on a 14 km torus around the camera, so there are always
 * a few in the sky wherever one looks, and they fade before reaching the
 * edge of that torus or the camera. Pure, unit tested.
 */

export const CLOUD_VOXEL = 40;
/** side of the square the clouds repeat on, m */
export const CLOUD_TILE = 14_000;
/** wind towards the north-east, m/s (x east, z south) */
export const WIND = { x: 4.3, z: -4.3 };

export interface Cloud {
  /** position of the cloud's origin at t = 0 */
  x: number;
  z: number;
  /** height of the cloud's base above the lake, m */
  base: number;
  /** filled voxels: integer cell coordinates (i east, j up, k south) */
  cells: [number, number, number][];
}

/** Small deterministic generator (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` clouds spread over the repeating square, the same every visit. */
export function makeClouds(count: number, seed = 1152): Cloud[] {
  const rnd = random(seed);
  const clouds: Cloud[] = [];
  for (let n = 0; n < count; n++) {
    // spread them on a jittered grid so that they never pile up
    const cols = Math.ceil(Math.sqrt(count));
    const gx = (n % cols) + 0.15 + rnd() * 0.7;
    const gz = Math.floor(n / cols) + 0.15 + rnd() * 0.7;
    const x = (gx / cols) * CLOUD_TILE - CLOUD_TILE / 2;
    const z = (gz / cols) * CLOUD_TILE - CLOUD_TILE / 2;
    clouds.push({ x, z, base: 1500 + rnd() * 500, cells: cloudCells(rnd) });
  }
  return clouds;
}

/** A cumulus: a few overlapping flattened ellipsoids, cut flat underneath. */
function cloudCells(rnd: () => number): [number, number, number][] {
  const blobs = 3 + Math.floor(rnd() * 4);
  const spec: { x: number; y: number; z: number; rx: number; ry: number; rz: number }[] = [];
  const length = 380 + rnd() * 520;
  for (let b = 0; b < blobs; b++) {
    const along = (b / Math.max(1, blobs - 1) - 0.5) * length;
    const big = 1 - Math.abs(along / length) * 0.9;
    spec.push({
      x: along + (rnd() - 0.5) * 120,
      y: 0,
      z: (rnd() - 0.5) * 160,
      rx: (120 + rnd() * 120) * big + 60,
      ry: (60 + rnd() * 70) * big + 30,
      rz: (100 + rnd() * 100) * big + 50,
    });
  }
  const V = CLOUD_VOXEL;
  const cells: [number, number, number][] = [];
  const reach = Math.ceil((length / 2 + 400) / V);
  for (let k = -reach; k <= reach; k++)
    for (let i = -reach; i <= reach; i++)
      for (let j = 0; j <= Math.ceil(220 / V); j++) {
        const px = (i + 0.5) * V;
        const py = (j + 0.5) * V;
        const pz = (k + 0.5) * V;
        if (spec.some((s) => ((px - s.x) / s.rx) ** 2 + ((py - s.y) / s.ry) ** 2 + ((pz - s.z) / s.rz) ** 2 <= 1)) cells.push([i, j, k]);
      }
  return cells;
}

/** `v` wrapped into [centre − size/2, centre + size/2). */
export function wrapAround(v: number, centre: number, size = CLOUD_TILE): number {
  return centre + ((((v - centre + size / 2) % size) + size) % size) - size / 2;
}

/**
 * Where a cloud is at `t` seconds: drifting with the wind, repeated on the
 * square around (`cx`, `cz`) (the camera).
 */
export function cloudPosition(c: Cloud, t: number, cx: number, cz: number): { x: number; z: number } {
  return { x: wrapAround(c.x + WIND.x * t, cx), z: wrapAround(c.z + WIND.z * t, cz) };
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Opacity of a cloud seen from a camera: clouds stay in the sky above the
 * view (gone once the camera rises near or above their base, so they never
 * veil the city or the spots) and fade before the edge of their square.
 */
export function cloudOpacity(cloudX: number, cloudZ: number, base: number, cam: { x: number; y: number; z: number }): number {
  const below = smoothstep(150, 550, base - cam.y);
  const far = 1 - smoothstep(4500, 6500, Math.hypot(cloudX - cam.x, cloudZ - cam.z));
  return below * far;
}
