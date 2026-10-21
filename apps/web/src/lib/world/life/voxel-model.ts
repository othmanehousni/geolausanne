/**
 * Little voxel models (boats, birds, clouds) built from boxes, with flat
 * colours per box and two optional extras per vertex: a night glow colour
 * (lit windows, navigation lights) and a part number (a bird's wings).
 */
import * as THREE from "three";

export interface VoxelBox {
  /** centre and size, metres */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  /** emitted at night (sRGB), e.g. a lit window */
  glow?: string;
  /** free number copied to every vertex (`aPart`) */
  part?: number;
}

// the six faces of a unit cube: normal, then four corners (counter-clockwise seen from outside)
const FACES: [number[], number[][]][] = [
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];

const _c = new THREE.Color();

export interface CellGroup {
  /** filled cells (integer coordinates) */
  cells: readonly (readonly [number, number, number])[];
  /** edge of a cell, metres */
  size: number;
  /** copied to every vertex of the group (`aPart`) */
  part: number;
  /** sRGB colour of a cell */
  color: (i: number, j: number, k: number) => string;
}

/**
 * The outside of voxel blobs (clouds): only faces between a filled and an
 * empty cell, all groups in one geometry (position, normal, color, aGlow,
 * aPart).
 */
export function cellGeometry(groups: readonly CellGroup[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  for (const g of groups) {
    const filled = new Set(g.cells.map(([i, j, k]) => `${i},${j},${k}`));
    for (const [i, j, k] of g.cells) {
      _c.set(g.color(i, j, k)).convertSRGBToLinear();
      for (const [normal, corners] of FACES) {
        if (filled.has(`${i + normal[0]!},${j + normal[1]!},${k + normal[2]!}`)) continue;
        const v = pos.length / 3;
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        for (const [cx, cy, cz] of corners) {
          pos.push((i + 0.5 + cx! / 2) * g.size, (j + 0.5 + cy! / 2) * g.size, (k + 0.5 + cz! / 2) * g.size);
          nor.push(normal[0]!, normal[1]!, normal[2]!);
          col.push(_c.r, _c.g, _c.b);
          part.push(g.part);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aGlow", new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geo.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  geo.setIndex(idx);
  return geo;
}

/** One geometry for all the boxes (position, normal, color, aGlow, aPart). */
export function voxelGeometry(boxes: readonly VoxelBox[]): THREE.BufferGeometry {
  const n = boxes.length * 24;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const glow = new Float32Array(n * 3);
  const part = new Float32Array(n);
  const idx: number[] = [];
  let v = 0;
  for (const b of boxes) {
    _c.set(b.color).convertSRGBToLinear();
    const [cr, cg, cb] = [_c.r, _c.g, _c.b];
    if (b.glow) _c.set(b.glow).convertSRGBToLinear();
    const [gr, gg, gb] = b.glow ? [_c.r, _c.g, _c.b] : [0, 0, 0];
    for (const [normal, corners] of FACES) {
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      for (const [cx, cy, cz] of corners) {
        pos.set([b.x + (cx! * b.w) / 2, b.y + (cy! * b.h) / 2, b.z + (cz! * b.d) / 2], v * 3);
        nor.set(normal, v * 3);
        col.set([cr, cg, cb], v * 3);
        glow.set([gr, gg, gb], v * 3);
        part[v] = b.part ?? 0;
        v++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aGlow", new THREE.BufferAttribute(glow, 3));
  g.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
