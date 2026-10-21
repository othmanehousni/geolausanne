/**
 * Rigorous conversion between Swiss LV95 (EPSG:2056) and WGS84 (EPSG:4326).
 *
 * Projection: the Swiss oblique conformal cylindrical projection on the Bessel
 * 1841 ellipsoid, implemented with the exact (non-series) formulas published by
 * swisstopo ("Formulas and constants for the calculation of the Swiss conformal
 * cylindrical projection and for the transformation between coordinate
 * systems").
 *
 * Datum: CH1903+ -> WGS84 with the official 3-parameter geocentric translation
 * (674.374 m, 15.056 m, 405.346 m). This is exactly what PostGIS/PROJ apply for
 * EPSG:2056 <-> EPSG:4326, so coordinates converted here round-trip with the
 * database to well below a millimetre. Heights are treated as 0 on both
 * ellipsoids (horizontal positions only), again matching 2D PostGIS transforms.
 */

const DEG = Math.PI / 180;

// Bessel 1841
const A_BESSEL = 6377397.155;
const E2_BESSEL = 0.006674372230614;
const E_BESSEL = Math.sqrt(E2_BESSEL);
// WGS84 / GRS80 share a and almost f; we use WGS84.
const A_WGS84 = 6378137.0;
const F_WGS84 = 1 / 298.257223563;
const E2_WGS84 = F_WGS84 * (2 - F_WGS84);

// Projection centre (old observatory of Bern) and false origin.
const PHI0 = (46 + 57 / 60 + 8.66 / 3600) * DEG;
const LAMBDA0 = (7 + 26 / 60 + 22.5 / 3600) * DEG;
const FALSE_E = 2_600_000;
const FALSE_N = 1_200_000;

// Derived constants
const R = (A_BESSEL * Math.sqrt(1 - E2_BESSEL)) / (1 - E2_BESSEL * Math.sin(PHI0) ** 2);
const ALPHA = Math.sqrt(1 + (E2_BESSEL / (1 - E2_BESSEL)) * Math.cos(PHI0) ** 4);
const B0 = Math.asin(Math.sin(PHI0) / ALPHA);
const K =
  Math.log(Math.tan(Math.PI / 4 + B0 / 2)) -
  ALPHA * Math.log(Math.tan(Math.PI / 4 + PHI0 / 2)) +
  ((ALPHA * E_BESSEL) / 2) * Math.log((1 + E_BESSEL * Math.sin(PHI0)) / (1 - E_BESSEL * Math.sin(PHI0)));

// CH1903+ -> WGS84 geocentric translation (metres)
const DX = 674.374;
const DY = 15.056;
const DZ = 405.346;

export interface LonLat {
  lon: number;
  lat: number;
}

export interface EN {
  e: number;
  n: number;
}

function geodeticToEcef(phi: number, lambda: number, h: number, a: number, e2: number): [number, number, number] {
  const sinPhi = Math.sin(phi);
  const n = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  return [
    (n + h) * Math.cos(phi) * Math.cos(lambda),
    (n + h) * Math.cos(phi) * Math.sin(lambda),
    (n * (1 - e2) + h) * sinPhi,
  ];
}

function ecefToGeodetic(x: number, y: number, z: number, a: number, e2: number): [number, number] {
  const lambda = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let phi = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const sinPhi = Math.sin(phi);
    const n = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const h = p / Math.cos(phi) - n;
    const next = Math.atan2(z, p * (1 - (e2 * n) / (n + h)));
    if (Math.abs(next - phi) < 1e-14) {
      phi = next;
      break;
    }
    phi = next;
  }
  return [phi, lambda];
}

/** Ellipsoidal (Bessel) geographic coordinates in radians -> LV95. */
function besselToLv95(phi: number, lambda: number): EN {
  const sinPhi = Math.sin(phi);
  const S =
    ALPHA * Math.log(Math.tan(Math.PI / 4 + phi / 2)) -
    ((ALPHA * E_BESSEL) / 2) * Math.log((1 + E_BESSEL * sinPhi) / (1 - E_BESSEL * sinPhi)) +
    K;
  const b = 2 * (Math.atan(Math.exp(S)) - Math.PI / 4);
  const l = ALPHA * (lambda - LAMBDA0);
  const lBar = Math.atan(Math.sin(l) / (Math.sin(B0) * Math.tan(b) + Math.cos(B0) * Math.cos(l)));
  const bBar = Math.asin(Math.cos(B0) * Math.sin(b) - Math.sin(B0) * Math.cos(b) * Math.cos(l));
  const y = R * lBar;
  const x = (R / 2) * Math.log((1 + Math.sin(bBar)) / (1 - Math.sin(bBar)));
  return { e: y + FALSE_E, n: x + FALSE_N };
}

/** LV95 -> Bessel geographic coordinates in radians. */
function lv95ToBessel(e: number, n: number): [number, number] {
  const y = e - FALSE_E;
  const x = n - FALSE_N;
  const lBar = y / R;
  const bBar = 2 * (Math.atan(Math.exp(x / R)) - Math.PI / 4);
  const b = Math.asin(Math.cos(B0) * Math.sin(bBar) + Math.sin(B0) * Math.cos(bBar) * Math.cos(lBar));
  const l = Math.atan(Math.sin(lBar) / (Math.cos(B0) * Math.cos(lBar) - Math.sin(B0) * Math.tan(bBar)));
  const lambda = LAMBDA0 + l / ALPHA;
  let phi = b;
  for (let i = 0; i < 20; i++) {
    const S =
      (1 / ALPHA) * (Math.log(Math.tan(Math.PI / 4 + b / 2)) - K) +
      E_BESSEL * Math.log(Math.tan(Math.PI / 4 + Math.asin(E_BESSEL * Math.sin(phi)) / 2));
    const next = 2 * Math.atan(Math.exp(S)) - Math.PI / 2;
    if (Math.abs(next - phi) < 1e-15) {
      phi = next;
      break;
    }
    phi = next;
  }
  return [phi, lambda];
}

/** LV95 easting/northing (metres) -> WGS84 longitude/latitude (degrees). */
export function lv95ToWgs84(e: number, n: number): LonLat {
  const [phiB, lamB] = lv95ToBessel(e, n);
  const [x, y, z] = geodeticToEcef(phiB, lamB, 0, A_BESSEL, E2_BESSEL);
  const [phi, lambda] = ecefToGeodetic(x + DX, y + DY, z + DZ, A_WGS84, E2_WGS84);
  return { lon: lambda / DEG, lat: phi / DEG };
}

/** WGS84 longitude/latitude (degrees) -> LV95 easting/northing (metres). */
export function wgs84ToLv95(lon: number, lat: number): EN {
  const [x, y, z] = geodeticToEcef(lat * DEG, lon * DEG, 0, A_WGS84, E2_WGS84);
  const [phiB, lamB] = ecefToGeodetic(x - DX, y - DY, z - DZ, A_BESSEL, E2_BESSEL);
  return besselToLv95(phiB, lamB);
}
