/**
 * Imperative handles shared between R3F components that must not trigger
 * React renders (the tile store is mutated every frame).
 */
import type * as THREE from "three";
import type { TileStore } from "./tile-store";

export const worldRegistry: {
  tiles: TileStore | null;
  horizon: THREE.Object3D | null;
} = {
  tiles: null,
  horizon: null,
};
