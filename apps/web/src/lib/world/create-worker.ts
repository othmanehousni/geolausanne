/** Kept next to the worker so bundlers can statically resolve the URL. */
export function createTileWorker(): Worker {
  return new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module", name: "geolausanne-tiles" });
}
