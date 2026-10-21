"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Place } from "@/lib/data/types";
import { worldUniforms } from "@/lib/world/materials";
import { surfaceHeightAt } from "@/lib/world/picking";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

const MAX = 1000;
const SAFFRON = new THREE.Color("#f2a33a");
const VERIFIED = new THREE.Color("#ffd166");
const DIM = new THREE.Color("#c98b3a");

interface Anchor {
  x: number;
  z: number;
  /** top surface under the spot (roof or ground), refined as tiles stream in */
  y: number;
  resolved: boolean;
}

/**
 * Pin name shown on hover/selection; decorative (the panel and list carry the
 * name). drei's <Html> owns a separate React root: it stays mounted and only
 * its text changes, because unmounting that root during a render (React 19)
 * throws and can leave other portals half-closed.
 */
function NameTag({ name }: { name: string | null }) {
  return (
    <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }} aria-hidden="true">
      <div
        className={
          name
            ? "-translate-y-10 rounded-full bg-popover/95 px-3 py-1 text-sm font-semibold whitespace-nowrap text-popover-foreground shadow-[var(--shadow-float)]"
            : "hidden"
        }
      >
        {name}
      </div>
    </Html>
  );
}

/**
 * Voxel pins for halal spots: a block "flag" on a thin stem, sized to stay
 * readable at any zoom, rendered with two instanced meshes. Picking uses R3F
 * instance events; the accessible equivalent is the spots list.
 */
export function PlaceMarkers() {
  const places = usePlacesStore((s) => s.places);
  const hoveredId = usePlacesStore((s) => s.hoveredId);
  const setHovered = usePlacesStore((s) => s.setHovered);
  const selectedId = useUiStore((s) => s.selectedPlaceId);
  const selectPlace = useUiStore((s) => s.selectPlace);
  const manifest = useWorldStore((s) => s.manifest);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const picking = useWorldStore((s) => s.picking);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const heads = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const selectedLabel = useRef<THREE.Group>(null);
  const hoveredLabel = useRef<THREE.Group>(null);
  const anchors = useRef(new Map<string, Anchor>());
  const lastResolve = useRef(0);

  const headGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const stemGeo = useMemo(() => new THREE.BoxGeometry(0.22, 1, 0.22).translate(0, 0.5, 0), []);
  // pins glow a little by day and like lanterns at night, so they stay the
  // brightest thing on the map
  const headMat = useMemo(() => new THREE.MeshLambertMaterial({ flatShading: true, emissive: new THREE.Color("#c46a00"), emissiveIntensity: 0.12 }), []);
  const stemMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#3b2a1a" }), []);

  // world-space anchor for each place (LV95 -> world)
  useEffect(() => {
    if (!manifest) return;
    const next = new Map<string, Anchor>();
    for (const p of places) {
      const prev = anchors.current.get(p.id);
      const x = p.easting - manifest.origin.easting;
      const z = manifest.origin.northing - p.northing;
      const fallbackY = p.elevation !== null ? p.elevation - manifest.origin.elevation : 0;
      next.set(p.id, prev && prev.x === x && prev.z === z ? prev : { x, z, y: fallbackY, resolved: false });
    }
    anchors.current = next;
  }, [places, manifest]);

  useEffect(() => {
    gl.domElement.style.cursor = hoveredId && !picking ? "pointer" : "";
  }, [hoveredId, picking, gl]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const h = heads.current;
    const s = stems.current;
    if (!h || !s) return;
    headMat.emissiveIntensity = 0.12 + 0.68 * worldUniforms.uNight.value;
    const now = performance.now();
    // refine heights against freshly streamed tiles a few times per second
    if (now - lastResolve.current > 600) {
      lastResolve.current = now;
      let budget = 40;
      for (const a of anchors.current.values()) {
        if (a.resolved || budget-- <= 0) continue;
        const y = surfaceHeightAt(a.x, a.z);
        if (y !== null) {
          a.y = y;
          a.resolved = true;
        }
      }
    }
    let i = 0;
    const t = clock.elapsedTime;
    for (const p of places) {
      if (i >= MAX) break;
      const a = anchors.current.get(p.id);
      if (!a) continue;
      const dist = camera.position.distanceTo(pos.set(a.x, a.y, a.z));
      // keep pins legible: roughly constant on-screen size, never smaller than 3 m
      const size = Math.max(3, dist * 0.022);
      const isSel = p.id === selectedId;
      const isHover = p.id === hoveredId;
      const bob = reducedMotion ? 0 : Math.sin(t * 2 + i) * size * 0.06;
      const lift = size * 2.4;
      const headSize = size * (isSel ? 1.35 : isHover ? 1.18 : 1);
      pos.set(a.x, a.y + lift + bob + headSize / 2, a.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, reducedMotion ? 0.6 : 0.6 + t * (isSel ? 1.2 : 0.35));
      scl.setScalar(headSize);
      m.compose(pos, q, scl);
      h.setMatrixAt(i, m);
      h.setColorAt(i, p.certification_verified ? VERIFIED : p.score < 0 ? DIM : SAFFRON);
      pos.set(a.x, a.y, a.z);
      q.identity();
      scl.set(size, lift + bob, size);
      m.compose(pos, q, scl);
      s.setMatrixAt(i, m);
      if (isSel) selectedLabel.current?.position.set(a.x, a.y, a.z);
      if (isHover) hoveredLabel.current?.position.set(a.x, a.y, a.z);
      if (isSel && ring.current) {
        ring.current.position.set(a.x, a.y + 0.3, a.z);
        const pulse = reducedMotion ? 1 : 1 + 0.15 * Math.sin(t * 3);
        ring.current.scale.setScalar(size * 2.2 * pulse);
      }
      i++;
    }
    h.count = i;
    s.count = i;
    h.instanceMatrix.needsUpdate = true;
    s.instanceMatrix.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
    h.computeBoundingSphere();
    if (ring.current) ring.current.visible = selectedId !== null && anchors.current.has(selectedId);
  });

  const idAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId !== undefined ? places[e.instanceId]?.id ?? null : null);

  const selected: Place | undefined = places.find((p) => p.id === selectedId);
  const hovered: Place | undefined = places.find((p) => p.id === hoveredId);
  return (
    <group name="place-markers">
      <instancedMesh
        ref={heads}
        args={[headGeo, headMat, MAX]}
        frustumCulled={false}
        onPointerMove={(e) => {
          if (picking) return;
          e.stopPropagation();
          const id = idAt(e);
          if (id !== usePlacesStore.getState().hoveredId) setHovered(id);
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          if (picking) return;
          e.stopPropagation();
          const id = idAt(e);
          if (id) selectPlace(id);
        }}
      />
      <instancedMesh ref={stems} args={[stemGeo, stemMat, MAX]} frustumCulled={false} raycast={() => null} />
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} raycast={() => null}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color="#f2a33a" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {/* name tags follow their pin: the groups are positioned every frame */}
      <group ref={selectedLabel}>
        <NameTag name={selected?.name ?? null} />
      </group>
      <group ref={hoveredLabel}>
        <NameTag name={hovered && hovered.id !== selected?.id ? hovered.name : null} />
      </group>
    </group>
  );
}
