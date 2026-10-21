"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LATER, raycastTiles } from "@/lib/world/picking";
import { useWorldStore } from "@/stores/world-store";

const CENTRE = new THREE.Vector2(0, 0);

/**
 * "Pick a location" mode: a ghost pin follows the pointer over buildings and
 * terrain; a click (not a drag) chooses the point. Keyboard users get the
 * same result from the "use map centre" action in the picking banner.
 */
export function PlacementPicker() {
  const picking = useWorldStore((s) => s.picking);
  const setHoverPoint = useWorldStore((s) => s.setHoverPoint);
  const setPickedPoint = useWorldStore((s) => s.setPickedPoint);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const ghost = useRef<THREE.Group>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const down = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);

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
    };
  }, [picking, gl, camera, setPickedPoint, setHoverPoint]);

  useFrame(() => {
    const g = ghost.current;
    if (!g) return;
    g.visible = picking && useWorldStore.getState().hoverPoint !== null;
    if (!picking || !dirty.current) return;
    raycaster.current.setFromCamera(ndc.current, camera);
    const hit = raycastTiles(raycaster.current, { canWait: true });
    // a tile's BVH was just built: try again next frame
    if (hit === LATER) return;
    dirty.current = false;
    const p = hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
    setHoverPoint(p);
    if (p) {
      const size = Math.max(3, camera.position.distanceTo(hit!.point) * 0.022);
      g.position.set(p.x, p.y, p.z);
      g.scale.setScalar(size);
    }
  });

  return (
    <group ref={ghost} visible={false}>
      <mesh position-y={2.9} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#f2a33a" transparent opacity={0.75} depthTest={false} />
      </mesh>
      <mesh position-y={1.2} raycast={() => null}>
        <boxGeometry args={[0.2, 2.4, 0.2]} />
        <meshBasicMaterial color="#3b2a1a" transparent opacity={0.6} depthTest={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.15} raycast={() => null}>
        <ringGeometry args={[0.7, 1, 32]} />
        <meshBasicMaterial color="#f2a33a" transparent opacity={0.9} depthTest={false} />
      </mesh>
    </group>
  );
}
