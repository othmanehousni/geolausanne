/**
 * Applies KHR_meshopt_compression to every GLB under a directory, in place,
 * then gzips the result.
 *
 * Usage: bun pipelines/geodata/tools/meshopt-compress.ts <dir> [--no-gzip]
 *
 * The Python pipeline writes plain (already quantised) GLBs; this step only
 * re-encodes buffer views with the official meshoptimizer encoder (vertex
 * codec v1, index codec for triangles), keeping every accessor untouched so
 * geometry stays bit-exact. meshopt output is designed to be followed by a
 * general-purpose compressor, which roughly halves it again; the web client
 * detects the gzip magic bytes and inflates with the native
 * DecompressionStream, so no CDN configuration is required.
 * Files that are already compressed are skipped.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { MeshoptEncoder } from "meshoptimizer";

const EXT = "KHR_meshopt_compression";
const ELEMENT_ARRAY_BUFFER = 34963;

type Json = Record<string, any>;

function parseGlb(buf: Uint8Array): { json: Json; bin: Uint8Array } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  let off = 12;
  let json: Json | undefined;
  let bin = new Uint8Array(0);
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (!json) throw new Error("GLB without JSON chunk");
  return { json, bin };
}

function writeGlb(json: Json, bin: Uint8Array): Uint8Array {
  let jb = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jb.length % 4)) % 4;
  const bpad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jb.length + jpad + 8 + bin.length + bpad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length + jpad, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  out.fill(0x20, 20 + jb.length, 20 + jb.length + jpad);
  const boff = 20 + jb.length + jpad;
  dv.setUint32(boff, bin.length + bpad, true);
  dv.setUint32(boff + 4, 0x004e4942, true);
  out.set(bin, boff + 8);
  return out;
}

export async function compressGlb(input: Uint8Array): Promise<Uint8Array | null> {
  const { json, bin } = parseGlb(input);
  if ((json.extensionsUsed ?? []).includes(EXT) || (json.extensionsUsed ?? []).includes("EXT_meshopt_compression")) {
    return null;
  }
  await MeshoptEncoder.ready;
  const accessors: Json[] = json.accessors ?? [];
  const chunks: Uint8Array[] = [];
  let compressedLength = 0;
  for (let vi = 0; vi < (json.bufferViews ?? []).length; vi++) {
    const view = json.bufferViews[vi];
    const src = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const users = accessors.filter((a) => a.bufferView === vi);
    let mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES";
    let size: number;
    let count: number;
    if (view.target === ELEMENT_ARRAY_BUFFER) {
      size = users[0]?.componentType === 5125 ? 4 : 2;
      count = view.byteLength / size;
      mode = count % 3 === 0 ? "TRIANGLES" : "INDICES";
    } else {
      size = view.byteStride ?? Math.round(view.byteLength / (users[0]?.count ?? 1));
      count = view.byteLength / size;
      mode = "ATTRIBUTES";
      if (size % 4 !== 0 || size > 256 || !Number.isInteger(count)) continue; // leave uncompressed
    }
    const encoded = MeshoptEncoder.encodeGltfBuffer(src, count, size, mode, mode === "ATTRIBUTES" ? 1 : undefined);
    const ext: Json = { buffer: 0, byteOffset: compressedLength, byteLength: encoded.length, byteStride: size, mode, count };
    chunks.push(encoded);
    compressedLength += encoded.length;
    const pad = (4 - (compressedLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      compressedLength += pad;
    }
    view.buffer = 1;
    view.extensions = { ...(view.extensions ?? {}), [EXT]: ext };
  }
  const out = new Uint8Array(compressedLength);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  json.buffers = [
    { byteLength: compressedLength },
    { byteLength: bin.length, extensions: { [EXT]: { fallback: true } } },
  ];
  json.extensionsUsed = Array.from(new Set([...(json.extensionsUsed ?? []), EXT]));
  json.extensionsRequired = Array.from(new Set([...(json.extensionsRequired ?? []), EXT]));
  return writeGlb(json, out);
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.name.endsWith(".glb")) yield p;
  }
}

if (import.meta.main) {
  const dir = process.argv[2];
  const gzip = !process.argv.includes("--no-gzip");
  if (!dir) {
    console.error("usage: bun meshopt-compress.ts <dir> [--no-gzip]");
    process.exit(2);
  }
  let before = 0;
  let after = 0;
  let files = 0;
  for await (const file of walk(dir)) {
    let input = new Uint8Array(await readFile(file));
    const originalSize = input.length;
    before += originalSize;
    const wasGzipped = input[0] === 0x1f && input[1] === 0x8b;
    if (wasGzipped) input = new Uint8Array(gunzipSync(input));
    const meshopt = await compressGlb(input);
    const glb = meshopt ?? input;
    const out = gzip ? new Uint8Array(gzipSync(glb, { level: 9 })) : glb;
    if (meshopt || gzip !== wasGzipped) {
      await writeFile(file, out);
      files++;
    }
    after += meshopt || gzip !== wasGzipped ? out.length : originalSize;
  }
  const mb = (n: number) => (n / 1e6).toFixed(1);
  console.log(`compressed ${files} files: ${mb(before)} MB -> ${mb(after)} MB`);
}
