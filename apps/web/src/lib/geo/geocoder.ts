/**
 * Street and place search with the free swisstopo GeoAdmin API (no key, no
 * account): https://api3.geo.admin.ch/services/sdiservices.html
 *
 *  - search:  SearchServer, type=locations (addresses, municipalities,
 *             postcodes and the swissNAMES3D gazetteer), limited to the
 *             service area so "Gare" means Lausanne's station
 *  - reverse: MapServer/identify on the federal building register, nearest
 *             entrance to a picked point
 */
import { lv95ToWgs84 } from "@geolausanne/geo-types";

const API = "https://api3.geo.admin.ch/rest/services/api";

/** A search that gets no answer fails after this long instead of spinning forever. */
export const GEOCODER_TIMEOUT_MS = 8000;

/**
 * GET JSON with the caller's signal plus a time limit covering the body too.
 * (AbortSignal.any / AbortSignal.timeout would do this, but Safari before
 * 17.4 has no AbortSignal.any.)
 */
async function getJson<T>(url: string, signal: AbortSignal | undefined, what: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException(`${what} timed out`, "TimeoutError")), GEOCODER_TIMEOUT_MS);
  const forward = () => ctrl.abort(signal?.reason);
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${what} HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

/** LV95 box around Lausanne (E min, N min, E max, N max) used to filter results. */
export const SEARCH_BBOX_LV95 = [2524000, 1143000, 2555000, 1166000] as const;

export type GeoResultKind = "address" | "place" | "municipality" | "postcode";

export interface GeoResult {
  id: string;
  kind: GeoResultKind;
  /** main line, e.g. "Rue Centrale 31" or "Flon" */
  name: string;
  /** secondary line, e.g. "1003 Lausanne" or "Neighbourhood · Lausanne" */
  detail: string | null;
  easting: number;
  northing: number;
  lon: number;
  lat: number;
}

interface SearchResponse {
  results?: {
    id: number | string;
    attrs: { origin: string; label: string; x: number; y: number; lon?: number; lat?: number; featureId?: string };
  }[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");
const tidy = (s: string) => decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();

/**
 * Turn swisstopo's HTML labels into two plain-text lines:
 *   address:   "Rue Centrale 31 <b>1003 Lausanne</b>"
 *   gazetteer: "<i>Partie de quartier</i> <b>Flon</b> (VD) - Lausanne"
 *   gg25:      "<b>Lausanne (VD)</b>"
 *   zipcode:   "<b>1003 - Lausanne (VD)</b>"
 */
export function parseLabel(html: string, origin: string): { name: string; detail: string | null } {
  if (origin === "address") {
    const bold = /<b>(.*?)<\/b>/.exec(html)?.[1];
    const street = tidy(html.replace(/<b>.*?<\/b>/g, ""));
    return { name: street || tidy(html), detail: bold ? tidy(bold) : null };
  }
  if (origin === "gazetteer") {
    const kind = /<i>(.*?)<\/i>/.exec(html)?.[1];
    const bold = /<b>(.*?)<\/b>/.exec(html)?.[1];
    const rest = tidy(html.replace(/<i>.*?<\/i>/g, "").replace(/<b>.*?<\/b>/g, ""));
    // rest looks like "(VD) - Lausanne" or "(VD) - Epalinges,Lausanne"
    const where = /-\s*(.+)$/.exec(rest)?.[1]?.split(",").map((s) => s.trim()).join(", ") ?? null;
    const detail = [kind ? tidy(kind) : null, where].filter(Boolean).join(" · ");
    return { name: bold ? tidy(bold) : tidy(html), detail: detail || null };
  }
  return { name: tidy(html), detail: null };
}

const KINDS: Record<string, GeoResultKind> = {
  address: "address",
  gazetteer: "place",
  gg25: "municipality",
  zipcode: "postcode",
};

/** Search streets and places around Lausanne. Throws on network errors and after GEOCODER_TIMEOUT_MS without an answer. */
export async function searchLocations(query: string, locale: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    searchText: q,
    type: "locations",
    origins: "address,gazetteer,gg25,zipcode",
    sr: "2056",
    limit: "8",
    lang: locale === "fr" ? "fr" : "en",
    bbox: SEARCH_BBOX_LV95.join(","),
  });
  const json = await getJson<SearchResponse>(`${API}/SearchServer?${params}`, signal, "geocoder");
  const seen = new Set<string>();
  const out: GeoResult[] = [];
  for (const r of json.results ?? []) {
    const kind = KINDS[r.attrs.origin];
    if (!kind) continue;
    // SearchServer returns LV95 as x = northing, y = easting
    const easting = r.attrs.y;
    const northing = r.attrs.x;
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) continue;
    const { name, detail } = parseLabel(r.attrs.label, r.attrs.origin);
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ll = r.attrs.lon !== undefined && r.attrs.lat !== undefined ? { lon: r.attrs.lon, lat: r.attrs.lat } : lv95ToWgs84(easting, northing);
    out.push({ id: `${r.attrs.origin}:${r.id}`, kind, name, detail, easting, northing, lon: ll.lon, lat: ll.lat });
  }
  return out;
}

interface IdentifyResponse {
  results?: {
    geometry?: { coordinates?: [number, number] };
    properties?: { strname_deinr?: string | null; dplz4?: number | string | null; dplzname?: string | null };
  }[];
}

/**
 * Nearest building address to an LV95 point (within ~30 m), e.g.
 * "Rue Centrale 31, 1003 Lausanne". Returns null when nothing is close.
 */
export async function reverseGeocode(easting: number, northing: number, signal?: AbortSignal): Promise<string | null> {
  const r = 60;
  const params = new URLSearchParams({
    geometry: `${easting},${northing}`,
    geometryType: "esriGeometryPoint",
    layers: "all:ch.bfs.gebaeude_wohnungs_register",
    mapExtent: `${easting - r},${northing - r},${easting + r},${northing + r}`,
    imageDisplay: "120,120,96",
    tolerance: "30",
    returnGeometry: "true",
    geometryFormat: "geojson",
    sr: "2056",
  });
  const json = await getJson<IdentifyResponse>(`${API}/MapServer/identify?${params}`, signal, "reverse geocoder");
  let best: { d: number; label: string } | null = null;
  for (const f of json.results ?? []) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p?.strname_deinr || !c) continue;
    const d = Math.hypot(c[0] - easting, c[1] - northing);
    const locality = [p.dplz4, p.dplzname].filter((v) => v !== null && v !== undefined && v !== "").join(" ");
    const label = locality ? `${p.strname_deinr}, ${locality}` : p.strname_deinr;
    if (!best || d < best.d) best = { d, label };
  }
  return best?.label ?? null;
}
