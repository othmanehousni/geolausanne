// @vitest-environment node
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseManifest, type CityManifest } from "@geolausanne/geo-types";
import { useWorldStore, type CameraCommand } from "@/stores/world-store";
import { flyToLv95, groundHeightAt, insideCity } from "../navigation";
import { worldRegistry } from "../registry";
import type { TileStore } from "../tile-store";

const ORIGIN = { easting: 2538000, northing: 1152000, elevation: 372 };

/** A 256 m root over x 0..256, z -256..0 with three level-0 children (one of them empty). */
const manifest = parseManifest({
  format: "geolausanne-voxel-city",
  formatVersion: 1,
  origin: ORIGIN,
  rootLevel: 1,
  lods: [
    { level: 0, voxelSize: 1, tileSize: 128 },
    { level: 1, voxelSize: 2, tileSize: 256 },
  ],
  bounds: { lv95: [2537000, 1151000, 2539000, 1153000], wgs84: [0, 0, 0, 0] },
  tiles: [
    [1, 0, 0, 100, 300, 500],
    [0, 0, 0, 200, 250, 100],
    [0, 1, 0, 0, 0, 0],
    [0, 0, 1, 150, 190, 100],
    [0, 1, 1, 150, 190, 100],
  ],
} as unknown as CityManifest);

const target = () => (useWorldStore.getState().command as Extract<CameraCommand, { kind: "flyTo" }>).target;

/** A loaded (not drawn) tile whose top surface is a plane at height `y`. */
function cachedTile(level: number, y: number) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
  mesh.position.y = y;
  mesh.userData.pickable = true;
  g.add(mesh);
  g.userData.tileKey = `${level}/0/0`;
  g.userData.tileLevel = level;
  g.visible = false;
  g.updateMatrixWorld(true);
  return g;
}

beforeEach(() => {
  useWorldStore.setState({ manifest, view: null, command: null });
});

afterEach(() => {
  worldRegistry.tiles = null;
});

describe("fly-to heights", () => {
  it("guess the ground from the finest tile in the manifest when nothing is loaded there", () => {
    // 40 % of the way up the level-0 tile's extent
    expect(groundHeightAt(64, -64)).toBeCloseTo(220);
    // its level-0 tile is empty: the root answers
    expect(groundHeightAt(200, -64)).toBeCloseTo(180);
    flyToLv95(ORIGIN.easting + 64, ORIGIN.northing + 64);
    expect(target()).toMatchObject({ x: 64, z: -64 });
    expect(target().y).toBeCloseTo(220);
  });

  it("prefer the finest tile loaded there, drawn or cached", () => {
    const tiles = [cachedTile(1, 240), cachedTile(0, 231)];
    worldRegistry.tiles = { loadedObjects: () => tiles } as unknown as TileStore;
    expect(groundHeightAt(64, -64)).toBeCloseTo(231);
  });

  it("use the stored elevation when the place has one", () => {
    flyToLv95(ORIGIN.easting + 64, ORIGIN.northing + 64, { elevation: 500 });
    expect(target().y).toBeCloseTo(128);
  });

  it("wait for the manifest when a link resolves before it, instead of guessing underground", () => {
    useWorldStore.setState({ manifest: null });
    flyToLv95(ORIGIN.easting + 64, ORIGIN.northing + 64);
    expect(useWorldStore.getState().command).toBeNull();
    useWorldStore.setState({ manifest });
    expect(target()).toMatchObject({ x: 64, z: -64 });
    expect(target().y).toBeCloseTo(220);
  });

  it("keep only the latest flight while the manifest loads", () => {
    useWorldStore.setState({ manifest: null });
    const commands: CameraCommand[] = [];
    const stop = useWorldStore.subscribe((s, prev) => {
      if (s.command && s.command !== prev.command) commands.push(s.command);
    });
    flyToLv95(ORIGIN.easting + 64, ORIGIN.northing + 64);
    flyToLv95(ORIGIN.easting + 200, ORIGIN.northing + 64);
    useWorldStore.setState({ manifest });
    stop();
    expect(commands).toHaveLength(1);
    expect(target()).toMatchObject({ x: 200, z: -64 });
  });

  it("fly at once to a stored elevation, manifest or not", () => {
    useWorldStore.setState({ manifest: null });
    flyToLv95(ORIGIN.easting + 64, ORIGIN.northing + 64, { elevation: 500 });
    expect(target().y).toBeCloseTo(128);
  });

  it("fall back to the current view where no tile is known", () => {
    useWorldStore.setState({ view: { x: 0, y: 500, z: 0, targetX: 0, targetY: 77, targetZ: 0, distance: 500, heading: 0 } });
    expect(groundHeightAt(-5000, 5000)).toBeNull();
    // inside the city's bounds, but over its empty level-0 corner and no loaded tile
    flyToLv95(ORIGIN.easting - 900, ORIGIN.northing + 900);
    expect(target().y).toBe(77);
  });
});

describe("fly-to outside the loaded city", () => {
  it("does not fly, and tells the caller instead of stopping at the city's edge", () => {
    let told = 0;
    flyToLv95(ORIGIN.easting - 5000, ORIGIN.northing, { onOutside: () => told++ });
    expect(useWorldStore.getState().command).toBeNull();
    expect(told).toBe(1);
    // without a caller to tell, still no flight
    flyToLv95(ORIGIN.easting - 5000, ORIGIN.northing);
    expect(useWorldStore.getState().command).toBeNull();
  });

  it("waits for the manifest to know, even with a stored elevation", () => {
    useWorldStore.setState({ manifest: null });
    let told = 0;
    flyToLv95(ORIGIN.easting - 5000, ORIGIN.northing, { elevation: 500, onOutside: () => told++ });
    expect(told).toBe(0);
    useWorldStore.setState({ manifest });
    expect(told).toBe(1);
    expect(useWorldStore.getState().command).toBeNull();
    // a point inside flies once the manifest is there
    useWorldStore.setState({ manifest: null });
    flyToLv95(ORIGIN.easting + 64, ORIGIN.northing + 64, { elevation: 500, onOutside: () => told++ });
    useWorldStore.setState({ manifest });
    expect(told).toBe(1);
    expect(target().y).toBeCloseTo(128);
  });

  it("knows the city's edge", () => {
    expect(insideCity(2537000, 1151000)).toBe(true);
    expect(insideCity(2539000, 1153000)).toBe(true);
    expect(insideCity(2536999, 1152000)).toBe(false);
    expect(insideCity(2538000, 1153001)).toBe(false);
    // before the city loads nothing is outside
    useWorldStore.setState({ manifest: null });
    expect(insideCity(0, 0)).toBe(true);
  });
});
