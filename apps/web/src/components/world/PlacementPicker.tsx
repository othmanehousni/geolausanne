"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { badgeSpriteName, markerAtlas, shadowSpriteName, type BadgeSize } from "@/lib/world/marker-atlas";
import { badgeSizeFor, badgeTexelSize } from "@/lib/world/marker-screen";
import { LATER, raycastTiles } from "@/lib/world/picking";
import { SpriteBatch } from "@/lib/world/sprite-batch";
import { useWorldStore } from "@/stores/world-store";

const CENTRE = new THREE.Vector2(0, 0);

/**
 * "Pick a location" mode: a ghost badge (a light badge with a saffron
 * cross) follows the pointer over buildings and terrain, its tip on the
 * surface under it; a click (not a drag) chooses the point. Keyboard users
 * get the same result from the "use map centre" action in the picking
 * banner.
 */
export function PlacementPicker() {
  const picking = useWorldStore((s) => s.picking);
  const setHoverPoint = useWorldStore((s) => s.setHoverPoint);
  const setPickedPoint = useWorldStore((s) => s.setPickedPoint);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const down = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);
  const ghost = useRef<THREE.Vector3 | null>(null);
  const batches = useMemo(
    () => ({
      shadow: new SpriteBatch(1, { name: "placement-shadow", depthTest: true, renderOrder: 11 }),
      badge: new SpriteBatch(1, { name: "placement-ghost", renderOrder: 22 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      batches.shadow.dispose();
      batches.badge.dispose();
    },
    [batches],
  );
  const sprites = useMemo(() => {
    const atlas = markerAtlas();
    const set = (size: BadgeSize) => ({ badge: atlas.sprites.get(badgeSpriteName("add", {}, size))!, shadow: atlas.sprites.get(shadowSpriteName(size))! });
    return { full: set("full"), compact: set("compact") };
  }, []);

  // "use the map centre" and Enter: the surface under the crosshair right
  // now (the reported view can be 250 ms old), else the orbit target
  useEffect(() => {
    const { setSurfaceAtCentre } = useWorldStore.getState();
    const ray = new THREE.Raycaster();
    setSurfaceAtCentre(() => {
      ray.setFromCamera(CENTRE, camera);
      const p = raycastTiles(ray)?.point ?? controls?.target ?? null;
      return p && { x: p.x, y: p.y, z: p.z };
    });
    return () => setSurfaceAtCentre(null);
  }, [camera, controls]);

  useEffect(() => {
    if (!picking) return;
    const el = gl.domElement;
    el.style.cursor = "crosshair";
    const toNdc = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.current.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    };
    const onMove = (ev: PointerEvent) => {
      toNdc(ev);
      dirty.current = true;
    };
    const onDown = (ev: PointerEvent) => {
      down.current = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return; // that was a drag
      toNdc(ev);
      raycaster.current.setFromCamera(ndc.current, camera);
      const hit = raycastTiles(raycaster.current);
      if (hit) setPickedPoint({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      setHoverPoint(null);
      ghost.current = null;
    };
  }, [picking, gl, camera, setPickedPoint, setHoverPoint]);

  useFrame(function placementFrame({ clock }) {
    if (picking && dirty.current) {
      raycaster.current.setFromCamera(ndc.current, camera);
      const hit = raycastTiles(raycaster.current, { canWait: true });
      // LATER: a tile's BVH was just built, try again next frame
      if (hit !== LATER) {
        dirty.current = false;
        const p = hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
        setHoverPoint(p);
        ghost.current = p ? (ghost.current ?? new THREE.Vector3()).set(p.x, p.y, p.z) : null;
      }
    }
    const { shadow, badge } = batches;
    shadow.begin();
    badge.begin();
    const g = ghost.current;
    if (picking && g && useWorldStore.getState().hoverPoint !== null) {
      const size = badgeSizeFor(badge.pxPerCss);
      const texel = badgeTexelSize(size, camera.position.distanceTo(g), badge.pxPerCss);
      const s = sprites[size];
      // the ghost floats a little above its point and breathes; it holds still with reduced motion
      const lift = useWorldStore.getState().reducedMotion ? 3 : 3 + 1.5 * Math.sin(clock.elapsedTime * 4);
      shadow.push(g.x, g.y, g.z, s.shadow, texel, 0, 1, 1, 1, 0.8);
      badge.push(g.x, g.y, g.z, s.badge, texel, lift, 1, 1, 1, 0.94);
    }
    shadow.end();
    badge.end();
  });

  return (
    <>
      <primitive object={batches.shadow.mesh} />
      <primitive object={batches.badge.mesh} />
    </>
  );
}
