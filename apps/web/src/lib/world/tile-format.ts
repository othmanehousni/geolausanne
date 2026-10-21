/**
 * Decoder for geovox tiles (see docs/pipeline/tile-format.md).
 *
 * The pipeline writes a deliberately small glTF subset: int16 positions +
 * rgba8 colours in one interleaved stream (stride 12), uint16/uint32
 * triangle indices, optional EXT_mesh_gpu_instancing prefabs, optional
 * KHR_meshopt_compression and an optional outer gzip. Parsing it ourselves
 * (in a worker) is much cheaper than a generic glTF loader and lets us
 * de-interleave into exactly the GPU layout we draw with.
 */

export interface DecodedPrimitive {
  material: "voxel" | "water";
  /** (V * 3) int16 voxel-space positions */
  positions: Int16Array;
  /** (V * 4) rgba8, alpha = shader class */
  colors: Uint8Array;
  indices: Uint16Array | Uint32Array;
  min: [number, number, number];
  max: [number, number, number];
}

export interface DecodedInstances {
  name: string;
  primitive: DecodedPrimitive;
  /** (n * 3) translations in the tile's voxel space */
  translations: Float32Array;
  /** (n * 4) quaternions or null */
  rotations: Float32Array | null;
}

export interface DecodedTile {
  translation: [number, number, number];
  scale: number;
  primitives: DecodedPrimitive[];
  instances: DecodedInstances[];
  /** bytes of geometry the tile will occupy on the GPU */
  gpuBytes: number;
}

export interface MeshoptDecoderLike {
  decodeGltfBuffer(target: Uint8Array, count: number, size: number, source: Uint8Array, mode: string, filter?: string): void;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const SHORT = 5122;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const FLOAT = 5126;

// glTF JSON is loosely shaped; fields are validated where they are read
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

export function isGzip(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  return b[0] === 0x1f && b[1] === 0x8b;
}

export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

function splitGlb(buf: ArrayBuffer): { json: Json; bin: Uint8Array } {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("tile is not a GLB file");
  let off = 12;
  let json: Json | null = null;
  let bin = new Uint8Array(0);
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === CHUNK_BIN) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  if (!json) throw new Error("GLB without JSON chunk");
  return { json, bin };
}

export function decodeTileGlb(buf: ArrayBuffer, decoder: MeshoptDecoderLike | null): DecodedTile {
  const { json } = splitGlb(buf);
  return decodeTileGlbFromJson(json, buf, decoder);
}

function decodeTileGlbFromJson(json: Json, buf: ArrayBuffer, decoder: MeshoptDecoderLike | null): DecodedTile {
  const { bin } = splitGlb(buf);
  const views: Json[] = json.bufferViews ?? [];
  const accessors: Json[] = json.accessors ?? [];
  const materials: Json[] = json.materials ?? [];
  const viewCache = new Map<number, Uint8Array>();

  const viewBytes = (vi: number): Uint8Array => {
    const cached = viewCache.get(vi);
    if (cached) return cached;
    const v = views[vi];
    if (!v) throw new Error(`missing bufferView ${vi}`);
    const ext = v.extensions?.KHR_meshopt_compression ?? v.extensions?.EXT_meshopt_compression;
    let out: Uint8Array;
    if (ext) {
      if (!decoder) throw new Error("meshopt-compressed tile but no decoder");
      out = new Uint8Array(ext.count * ext.byteStride);
      const src = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength);
      decoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter);
    } else {
      out = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    }
    viewCache.set(vi, out);
    return out;
  };

  const decodePrimitive = (p: Json): DecodedPrimitive => {
    const pa = accessors[p.attributes.POSITION];
    const ca = accessors[p.attributes.COLOR_0];
    const ia = accessors[p.indices];
    if (!pa || !ca || !ia) throw new Error("primitive is missing POSITION, COLOR_0 or indices");
    if (pa.componentType !== SHORT || ca.componentType !== UNSIGNED_BYTE) throw new Error("unexpected attribute types");
    const count: number = pa.count;
    const pview = views[pa.bufferView];
    const stride: number = pview.byteStride ?? 6;
    const vbytes = viewBytes(pa.bufferView);
    const cbytes = viewBytes(ca.bufferView);
    const cstride: number = views[ca.bufferView].byteStride ?? 4;
    const positions = new Int16Array(count * 3);
    const colors = new Uint8Array(count * 4);
    const pdv = new DataView(vbytes.buffer, vbytes.byteOffset, vbytes.byteLength);
    const po = pa.byteOffset ?? 0;
    const co = ca.byteOffset ?? 0;
    for (let i = 0; i < count; i++) {
      const b = i * stride + po;
      positions[i * 3] = pdv.getInt16(b, true);
      positions[i * 3 + 1] = pdv.getInt16(b + 2, true);
      positions[i * 3 + 2] = pdv.getInt16(b + 4, true);
      const c = i * cstride + co;
      colors[i * 4] = cbytes[c]!;
      colors[i * 4 + 1] = cbytes[c + 1]!;
      colors[i * 4 + 2] = cbytes[c + 2]!;
      colors[i * 4 + 3] = cbytes[c + 3]!;
    }
    const ibytes = viewBytes(ia.bufferView);
    const ioff = (ia.byteOffset ?? 0) + ibytes.byteOffset;
    let indices: Uint16Array | Uint32Array;
    if (ia.componentType === UNSIGNED_SHORT) {
      indices = new Uint16Array(ia.count);
      indices.set(new Uint16Array(ibytes.buffer.slice(ioff, ioff + ia.count * 2)));
    } else if (ia.componentType === UNSIGNED_INT) {
      indices = new Uint32Array(ia.count);
      indices.set(new Uint32Array(ibytes.buffer.slice(ioff, ioff + ia.count * 4)));
    } else {
      throw new Error("unexpected index type");
    }
    const matName: string = materials[p.material]?.name ?? "voxel";
    return {
      material: matName === "water" ? "water" : "voxel",
      positions,
      colors,
      indices,
      min: (pa.min ?? [0, 0, 0]) as [number, number, number],
      max: (pa.max ?? [0, 0, 0]) as [number, number, number],
    };
  };

  const readFloats = (accIndex: number, comps: number): Float32Array => {
    const a = accessors[accIndex];
    if (!a || a.componentType !== FLOAT) throw new Error("instance attribute must be FLOAT");
    const bytes = viewBytes(a.bufferView);
    const off = (a.byteOffset ?? 0) + bytes.byteOffset;
    return new Float32Array(bytes.buffer.slice(off, off + a.count * comps * 4));
  };

  const nodes: Json[] = json.nodes ?? [];
  const meshes: Json[] = json.meshes ?? [];
  const rootIndex = json.scenes?.[json.scene ?? 0]?.nodes?.[0] ?? 0;
  const root = nodes[rootIndex];
  if (!root) throw new Error("tile has no root node");
  const primitives: DecodedPrimitive[] = [];
  if (root.mesh !== undefined) for (const p of meshes[root.mesh].primitives) primitives.push(decodePrimitive(p));
  const instances: DecodedInstances[] = [];
  for (const ci of root.children ?? []) {
    const child = nodes[ci];
    const inst = child?.extensions?.EXT_mesh_gpu_instancing;
    if (!child || child.mesh === undefined || !inst) continue;
    const prim = decodePrimitive(meshes[child.mesh].primitives[0]);
    instances.push({
      name: child.name ?? "prefab",
      primitive: prim,
      translations: readFloats(inst.attributes.TRANSLATION, 3),
      rotations: inst.attributes.ROTATION !== undefined ? readFloats(inst.attributes.ROTATION, 4) : null,
    });
  }
  const gpuBytes =
    primitives.reduce((s, p) => s + p.positions.byteLength + p.colors.byteLength + p.indices.byteLength, 0) +
    instances.reduce(
      (s, i) => s + i.primitive.positions.byteLength + i.primitive.colors.byteLength + i.primitive.indices.byteLength + (i.translations.length / 3) * 64,
      0,
    );
  const t = (root.translation ?? [0, 0, 0]) as [number, number, number];
  const scale = (root.scale?.[0] ?? 1) as number;
  return { translation: t, scale, primitives, instances, gpuBytes };
}

export interface DecodedNode {
  name: string;
  translation: [number, number, number];
  scale: [number, number, number];
  primitives: DecodedPrimitive[];
}

/**
 * Decode every root node of a scene (used for the horizon, whose rings have
 * different non-uniform scales). Instancing is not supported here.
 */
export function decodeSceneGlb(buf: ArrayBuffer, decoder: MeshoptDecoderLike | null): DecodedNode[] {
  const { json } = splitGlb(buf);
  const roots: number[] = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  const out: DecodedNode[] = [];
  for (const ri of roots) {
    // decode by re-rooting: reuse the tile decoder on a JSON view with a single root
    const node = json.nodes[ri];
    const single = { ...json, scenes: [{ nodes: [ri] }], scene: 0 };
    const tile = decodeTileGlbFromJson(single, buf, decoder);
    const s = node.scale ?? [1, 1, 1];
    out.push({
      name: node.name ?? `node-${ri}`,
      translation: (node.translation ?? [0, 0, 0]) as [number, number, number],
      scale: [s[0], s[1], s[2]] as [number, number, number],
      primitives: tile.primitives,
    });
  }
  return out;
}

/** Transferable buffers of a decoded tile (for postMessage). */
export function tileTransferables(t: DecodedTile): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const add = (p: DecodedPrimitive) => out.push(p.positions.buffer as ArrayBuffer, p.colors.buffer as ArrayBuffer, p.indices.buffer as ArrayBuffer);
  t.primitives.forEach(add);
  for (const i of t.instances) {
    add(i.primitive);
    out.push(i.translations.buffer as ArrayBuffer);
    if (i.rotations) out.push(i.rotations.buffer as ArrayBuffer);
  }
  return out;
}
