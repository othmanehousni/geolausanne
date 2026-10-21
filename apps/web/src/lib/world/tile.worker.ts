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
  | { type: "error"; id: number; message: string; aborted: boolean };

const controllers = new Map<number, AbortController>();
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<TileWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    controllers.get(msg.id)?.abort();
    return;
  }
  const ctrl = new AbortController();
  controllers.set(msg.id, ctrl);
  try {
    const res = await fetch(msg.url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${msg.url}`);
    let buf = await res.arrayBuffer();
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
    const aborted = ctrl.signal.aborted;
    const reply: TileWorkerResponse = {
      type: "error",
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
      aborted,
    };
    scope.postMessage(reply);
  } finally {
    controllers.delete(msg.id);
  }
};
