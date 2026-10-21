// @vitest-environment node
import { describe, expect, it } from "vitest";
import { autumn, dayLight, daylightInstant, MIN_DAY_ELEVATION, mixLight, NIGHT_LIGHT, solarPosition, sunDirection } from "../sun";

const DEG = 180 / Math.PI;
const utc = (s: string) => Date.parse(s);

/** First instant of the day (scanning minute by minute) where the elevation crosses `deg`. */
function crossing(dayStartMs: number, deg: number, rising: boolean): number {
  let prev = solarPosition(dayStartMs).elevation * DEG;
  for (let t = dayStartMs + 60_000; t < dayStartMs + 86_400_000; t += 60_000) {
    const e = solarPosition(t).elevation * DEG;
    if (rising ? prev < deg && e >= deg : prev > deg && e <= deg) return t;
    prev = e;
  }
  throw new Error("no crossing");
}

describe("solar position over Lausanne", () => {
  it("culminates at 90 - latitude +- the obliquity on the solstices", () => {
    let maxJune = -90;
    let maxDec = -90;
    for (let m = 0; m < 24 * 60; m += 2) {
      maxJune = Math.max(maxJune, solarPosition(utc("2026-06-21T00:00:00Z") + m * 60_000).elevation * DEG);
      maxDec = Math.max(maxDec, solarPosition(utc("2026-12-21T00:00:00Z") + m * 60_000).elevation * DEG);
    }
    expect(maxJune).toBeCloseTo(90 - 46.5197 + 23.44, 0);
    expect(maxDec).toBeCloseTo(90 - 46.5197 - 23.44, 0);
  });

  it("is due south at solar noon (about 13:33 summer time)", () => {
    const p = solarPosition(utc("2026-06-21T11:33:00Z"));
    expect(p.azimuth * DEG).toBeGreaterThan(178);
    expect(p.azimuth * DEG).toBeLessThan(182);
    expect(Math.abs(p.hourAngle * DEG)).toBeLessThan(1);
  });

  it("rises in the east-north-east and sets around 21:30 on the longest day", () => {
    const day = utc("2026-06-21T00:00:00Z");
    const rise = crossing(day, -0.833, true);
    const set = crossing(day, -0.833, false);
    // 05:41 and 21:29 local summer time (UTC+2), within a few minutes
    expect(Math.abs(rise - utc("2026-06-21T03:41:00Z"))).toBeLessThan(8 * 60_000);
    expect(Math.abs(set - utc("2026-06-21T19:29:00Z"))).toBeLessThan(8 * 60_000);
    expect(solarPosition(rise).azimuth * DEG).toBeGreaterThan(50);
    expect(solarPosition(rise).azimuth * DEG).toBeLessThan(60);
  });

  it("points the light at the sun in world axes (x east, y up, z south)", () => {
    const south = sunDirection(Math.PI, 0);
    expect(south[2]).toBeCloseTo(1);
    const east = sunDirection(Math.PI / 2, 0);
    expect(east[0]).toBeCloseTo(1);
    expect(sunDirection(0, Math.PI / 2)[1]).toBeCloseTo(1);
  });
});

describe("day mode is clamped to daylight", () => {
  it("keeps the real instant while the sun is up", () => {
    const noon = utc("2026-10-21T11:00:00Z");
    expect(daylightInstant(noon)).toBe(noon);
  });

  it("shows the evening light late at night and the morning light before dawn", () => {
    const night = utc("2026-10-21T21:00:00Z"); // 23:00 in Lausanne
    const evening = daylightInstant(night);
    expect(evening).toBeLessThan(night);
    const pe = solarPosition(evening);
    expect(pe.elevation * DEG).toBeCloseTo(MIN_DAY_ELEVATION, 1);
    expect(pe.hourAngle).toBeGreaterThan(0);

    const dawn = utc("2026-10-21T04:00:00Z"); // 06:00 in Lausanne
    const morning = daylightInstant(dawn);
    expect(morning).toBeGreaterThan(dawn);
    const pm = solarPosition(morning);
    expect(pm.elevation * DEG).toBeCloseTo(MIN_DAY_ELEVATION, 1);
    expect(pm.hourAngle).toBeLessThan(0);
  });

  it("works in the polar-ish winter too (short days)", () => {
    const t = daylightInstant(utc("2026-12-21T23:30:00Z"));
    expect(solarPosition(t).elevation * DEG).toBeGreaterThanOrEqual(MIN_DAY_ELEVATION - 0.01);
  });
});

describe("light of the day", () => {
  const warmth = (c: [number, number, number]) => c[0] - c[2];

  it("is golden in the evening, cooler in the morning, neutral at noon", () => {
    const evening = dayLight(daylightInstant(utc("2026-10-21T21:00:00Z")));
    const morning = dayLight(daylightInstant(utc("2026-10-21T04:00:00Z")));
    const noon = dayLight(utc("2026-06-21T11:33:00Z"));
    expect(warmth(evening.sunColor)).toBeGreaterThan(warmth(morning.sunColor));
    expect(warmth(morning.sunColor)).toBeGreaterThan(warmth(noon.sunColor));
    expect(warmth(noon.sunColor)).toBeLessThan(0.08); // a warm white
    // low sun: roofs get less direct light (the sky lights them), walls facing the sun glow
    const lum = (c: [number, number, number]) => (c[0] + c[1] + c[2]) / 3;
    const top = (l: typeof noon) => l.sunIntensity * l.sunDir[1] * lum(l.sunColor) + l.hemiIntensity * lum(l.skyColor);
    expect(top(evening)).toBeLessThan(top(noon));
    expect(evening.sunIntensity * Math.hypot(evening.sunDir[0], evening.sunDir[2])).toBeGreaterThan(
      noon.sunIntensity * Math.hypot(noon.sunDir[0], noon.sunDir[2]),
    );
    // the sky is blue overhead and the sun is above the horizon
    expect(noon.zenith[2]).toBeGreaterThan(noon.zenith[0]);
    expect(evening.sunDir[1]).toBeGreaterThan(0);
  });

  it("cross-fades to the night", () => {
    const day = dayLight(utc("2026-10-21T11:00:00Z"));
    const same = mixLight(day, NIGHT_LIGHT, 0);
    expect(same.zenith).toEqual(day.zenith);
    same.sunDir.forEach((v, i) => expect(v).toBeCloseTo(day.sunDir[i]!, 9));
    const m = mixLight(day, NIGHT_LIGHT, 1);
    expect(m.zenith).toEqual(NIGHT_LIGHT.zenith);
    expect(Math.hypot(...m.sunDir)).toBeCloseTo(1);
    const half = mixLight(day, NIGHT_LIGHT, 0.5);
    expect(half.sunIntensity).toBeCloseTo((day.sunIntensity + NIGHT_LIGHT.sunIntensity) / 2);
  });
});

describe("season", () => {
  it("turns broadleaf trees in autumn only", () => {
    expect(autumn(utc("2026-07-15T12:00:00Z"))).toBe(0);
    expect(autumn(utc("2026-10-21T12:00:00Z"))).toBeGreaterThan(0.6);
    expect(autumn(utc("2026-11-03T12:00:00Z"))).toBeCloseTo(1, 1);
    expect(autumn(utc("2026-12-31T12:00:00Z"))).toBe(0);
  });
});
