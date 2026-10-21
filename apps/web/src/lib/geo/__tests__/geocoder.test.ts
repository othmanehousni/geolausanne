// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeEntities, parseLabel, reverseGeocode, searchLocations } from "../geocoder";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown) {
  const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("parseLabel", () => {
  it("splits addresses into street and locality", () => {
    expect(parseLabel("Rue Centrale 31 <b>1003 Lausanne</b>", "address")).toEqual({ name: "Rue Centrale 31", detail: "1003 Lausanne" });
  });

  it("keeps the gazetteer kind and the municipalities", () => {
    expect(parseLabel("<i>Partie de quartier</i> <b>Flon</b> (VD) - Lausanne", "gazetteer")).toEqual({
      name: "Flon",
      detail: "Partie de quartier · Lausanne",
    });
    expect(parseLabel("<i>Cours d’eau</i> <b>Le Flon</b> (VD) - Le Mont-sur-Lausanne,Epalinges,Lausanne", "gazetteer").detail).toBe(
      "Cours d’eau · Le Mont-sur-Lausanne, Epalinges, Lausanne",
    );
  });

  it("strips markup from other origins", () => {
    expect(parseLabel("<b>Lausanne (VD)</b>", "gg25")).toEqual({ name: "Lausanne (VD)", detail: null });
  });

  it("decodes HTML entities", () => {
    expect(decodeEntities("Ch. de l&#39;Esp&eacute;rance &amp; co")).toBe("Ch. de l'Esp&eacute;rance & co");
    expect(decodeEntities("&#x2019;")).toBe("’");
  });
});

describe("searchLocations", () => {
  it("swaps swisstopo's x/y into easting/northing and drops duplicates", async () => {
    const fetch = stubFetch({
      results: [
        { id: 1, attrs: { origin: "address", label: "Rue Centrale 31 <b>1003 Lausanne</b>", x: 1152510.25, y: 2538405, lon: 6.6359, lat: 46.521 } },
        { id: 2, attrs: { origin: "address", label: "Rue Centrale 31 <b>1003 Lausanne</b>", x: 1152510.25, y: 2538405 } },
        { id: 3, attrs: { origin: "parcel", label: "ignored", x: 1, y: 2 } },
      ],
    });
    const out = await searchLocations("rue centrale", "fr");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "address", name: "Rue Centrale 31", easting: 2538405, northing: 1152510.25 });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("lang")).toBe("fr");
    expect(url.searchParams.get("bbox")).toBe("2524000,1143000,2555000,1166000");
  });

  it("does not call the API for one letter", async () => {
    const fetch = stubFetch({ results: [] });
    expect(await searchLocations("a", "en")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("reverseGeocode", () => {
  it("returns the nearest building entrance", async () => {
    stubFetch({
      results: [
        { geometry: { coordinates: [2538383.3, 1152509.4] }, properties: { strname_deinr: "Rue Centrale 29", dplz4: 1003, dplzname: "Lausanne" } },
        { geometry: { coordinates: [2538405.1, 1152510.2] }, properties: { strname_deinr: "Rue Centrale 31", dplz4: 1003, dplzname: "Lausanne" } },
      ],
    });
    expect(await reverseGeocode(2538404, 1152511)).toBe("Rue Centrale 31, 1003 Lausanne");
  });

  it("returns null when nothing is close", async () => {
    stubFetch({ results: [] });
    expect(await reverseGeocode(2538000, 1152000)).toBeNull();
  });
});
