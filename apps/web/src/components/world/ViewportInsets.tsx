"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

/** The side panels' right edge (PlacePanel, SpotsList): a 1 rem margin and 24.5 rem. */
const SIDE_PANEL_REM = 1 + 24.5;
/** The phone sheet's peek snap point (PlacePanel) and the top bar's bottom edge (TopBar). */
const SHEET_PEEK_REM = 19;
const TOP_BAR_REM = 0.75 + 2.75;

/**
 * Keeps the centre of the map in the part of the screen people can see.
 * While a side panel (desktop) or the spot sheet (phones) covers part of the
 * map, the camera's view is shifted (`setViewOffset`) so the orbit target,
 * where a flight to a spot lands, sits in the middle of the uncovered area
 * instead of behind the panel. The shift eases in and out with the panels
 * (at once with reduced motion). Picking a location has no shift: its
 * crosshair is the middle of the screen.
 */
export function ViewportInsets() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const desktop = useIsDesktop();
  const selected = useUiStore((s) => s.selectedPlaceId !== null);
  const listOpen = useUiStore((s) => s.listOpen);
  const picking = useWorldStore((s) => s.picking);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const offset = useRef({ x: 0, y: 0 });

  // how far the middle of the uncovered area is from the middle of the screen
  const rem = typeof document === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let goalX = 0;
  let goalY = 0;
  if (!picking && desktop && (selected || listOpen)) goalX = -(SIDE_PANEL_REM * rem) / 2;
  else if (!picking && desktop === false && selected) goalY = ((SHEET_PEEK_REM - TOP_BAR_REM) * rem) / 2;

  // a frame to start from when the map renders on demand
  useEffect(() => invalidate(), [goalX, goalY, invalidate]);

  useFrame((_, delta) => {
    const o = offset.current;
    // exponential approach: most of the way in about 300 ms, like the panels
    const k = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 10);
    o.x += (goalX - o.x) * k;
    o.y += (goalY - o.y) * k;
    if (Math.abs(goalX - o.x) < 0.5) o.x = goalX;
    if (Math.abs(goalY - o.y) < 0.5) o.y = goalY;
    const view = camera.view;
    if (o.x === 0 && o.y === 0) {
      if (view?.enabled) camera.clearViewOffset();
      return;
    }
    const { width, height } = size;
    if (!view?.enabled || view.offsetX !== o.x || view.offsetY !== o.y || view.fullWidth !== width || view.fullHeight !== height) {
      camera.setViewOffset(width, height, o.x, o.y, width, height);
    }
    // keep frames coming while the shift moves, also when the map renders on demand
    if (o.x !== goalX || o.y !== goalY) invalidate();
    // before the badges' layout (-0.5), so their hit boxes use this frame's projection
  }, -1);

  return null;
}
