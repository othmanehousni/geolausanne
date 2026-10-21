/// <reference lib="webworker" />
/**
 * Tile worker: fetch -> (gunzip) -> meshopt decode -> de-interleave.
 * Everything heavy happens here so streaming never blocks rendering.
 */
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  decodeSceneGlb,
  decodeTileGlb,
  gunzip,
  isGzip,
  tileTransferables,
  type DecodedNode,
  type DecodedTile,
} from "./tile-format";

export type TileWorkerRequest =
  | { type: "load"; id: number; url: string; mode: "tile" | "scene" }
  | { type: "cancel"; id: number };

export type TileWorkerResponse =
  | { type: "loaded"; id: number; tile: DecodedTile; transferBytes: number }
  | { type: "scene"; id: number; nodes: DecodedNode[]; transferBytes: number }
  /** a slow download is still receiving data */
  | { type: "progress"; id: number }
  | { type: "error"; id: number; message: string; aborted: boolean };

/** A fetch that receives nothing for this long is given up (and retried by the store). */
const STALL_MS = 20_000;
/** At most one progress message per load this often (the store's deadline is 30 s). */
const PROGRESS_MS = 5_000;

const controllers = new Map<number, AbortController>();
const scope = self as unknown as DedicatedWorkerGlobalScope;

/** The whole body, calling `onData` whenever bytes arrive. */
async function readBody(res: Response, onData: () => void): Promise<ArrayBuffer> {
  if (!res.body) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value);
    size += r.value.byteLength;
    onData();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

scope.onmessage = async (event: MessageEvent<TileWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    controllers.get(msg.id)?.abort();
    return;
  }
  const ctrl = new AbortController();
  controllers.set(msg.id, ctrl);
  // a stalled connection is aborted; a slow but steady one goes on (and says so)
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastProgress = performance.now();
  const receiving = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      ctrl.abort();
    }, STALL_MS);
    const now = performance.now();
    if (now - lastProgress > PROGRESS_MS) {
      lastProgress = now;
      scope.postMessage({ type: "progress", id: msg.id } satisfies TileWorkerResponse);
    }
  };
  receiving();
  try {
    const res = await fetch(msg.url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${msg.url}`);
    let buf = await readBody(res, receiving);
    clearTimeout(timer);
    const transferBytes = buf.byteLength;
    if (isGzip(buf)) buf = await gunzip(buf);
    await MeshoptDecoder.ready;
    if (msg.mode === "scene") {
      const nodes = decodeSceneGlb(buf, MeshoptDecoder);
      const transfers = nodes.flatMap((n) =>
        n.primitives.flatMap((p) => [p.positions.buffer, p.colors.buffer, p.indices.buffer] as ArrayBuffer[]),
      );
      const reply: TileWorkerResponse = { type: "scene", id: msg.id, nodes, transferBytes };
      scope.postMessage(reply, transfers);
    } else {
      const tile = decodeTileGlb(buf, MeshoptDecoder);
      const reply: TileWorkerResponse = { type: "loaded", id: msg.id, tile, transferBytes };
      scope.postMessage(reply, tileTransferables(tile));
    }
  } catch (err) {
    const reply: TileWorkerResponse = {
      type: "error",
      id: msg.id,
      message: stalled ? `no data for ${STALL_MS / 1000} s from ${msg.url}` : err instanceof Error ? err.message : String(err),
      // a stall is a failure to retry, not a cancellation
      aborted: ctrl.signal.aborted && !stalled,
    };
    scope.postMessage(reply);
  } finally {
    clearTimeout(timer);
    controllers.delete(msg.id);
  }
};
