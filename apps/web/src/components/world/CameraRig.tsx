"use client";

import { MapControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { HOME_VIEW } from "@/lib/world/config";
import { surfaceHeightAt } from "@/lib/world/picking";
import { useWorldStore, type CameraTarget } from "@/stores/world-store";

const MIN_DISTANCE = 25;
const MAX_DISTANCE = 9000;
const MIN_POLAR = 0.08;
const MAX_POLAR = Math.PI * 0.47;

interface Flight {
  from: { pos: THREE.Vector3; target: THREE.Vector3 };
  to: { pos: THREE.Vector3; target: THREE.Vector3 };
  start: number;
  duration: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function cameraPositionFor(target: THREE.Vector3, distance: number, azimuth: number, polar: number) {
  return new THREE.Vector3(
    target.x + distance * Math.sin(polar) * Math.sin(azimuth),
    target.y + distance * Math.cos(polar),
    target.z + distance * Math.sin(polar) * Math.cos(azimuth),
  );
}

/**
 * Map-style camera: drag to pan, right-drag / two fingers to rotate and tilt,
 * wheel / pinch to zoom. Also executes camera commands (fly-to, zoom, rotate)
 * from the UI and keyboard, clamps the view to the city and keeps the depth
 * range tight for precision.
 */
export function CameraRig() {
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const flight = useRef<Flight | null>(null);
  const lastCommand = useRef(0);
  const lastViewReport = useRef(0);
  const lastGroundProbe = useRef(0);
  const groundY = useRef<number | null>(null);
  const manifest = useWorldStore((s) => s.manifest);

  // initial placement
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const target = new THREE.Vector3(HOME_VIEW.x, HOME_VIEW.y, HOME_VIEW.z);
    c.target.copy(target);
    camera.position.copy(cameraPositionFor(target, HOME_VIEW.distance, HOME_VIEW.azimuth, HOME_VIEW.polar));
    c.update();
  }, [camera]);

  const flyTo = (t: CameraTarget, instant: boolean) => {
    const c = controls.current;
    if (!c) return;
    const curOffset = camera.position.clone().sub(c.target);
    const sph = new THREE.Spherical().setFromVector3(curOffset);
    const target = new THREE.Vector3(t.x, t.y, t.z);
    const distance = THREE.MathUtils.clamp(t.distance ?? sph.radius, MIN_DISTANCE, MAX_DISTANCE);
    const polar = THREE.MathUtils.clamp(t.polar ?? sph.phi, MIN_POLAR, MAX_POLAR);
    const azimuth = t.azimuth ?? sph.theta;
    const pos = cameraPositionFor(target, distance, azimuth, polar);
    if (instant) {
      c.target.copy(target);
      camera.position.copy(pos);
      c.update();
      flight.current = null;
      invalidate();
      return;
    }
    const travel = c.target.distanceTo(target) + Math.abs(sph.radius - distance);
    flight.current = {
      from: { pos: camera.position.clone(), target: c.target.clone() },
      to: { pos, target },
      start: performance.now(),
      duration: THREE.MathUtils.clamp(500 + travel * 0.35, 600, 1600),
    };
    invalidate();
  };

  useEffect(() => {
    const handle = (state: ReturnType<typeof useWorldStore.getState>) => {
      const cmd = state.command;
      const c = controls.current;
      if (!cmd || cmd.id === lastCommand.current || !c) return;
      lastCommand.current = cmd.id;
      const instant = state.reducedMotion;
      const offset = camera.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      switch (cmd.kind) {
        case "flyTo":
          flyTo(cmd.target, instant);
          break;
        case "zoom":
          flyTo({ x: c.target.x, y: c.target.y, z: c.target.z, distance: sph.radius * cmd.factor }, instant);
          break;
        case "rotate":
          flyTo({ x: c.target.x, y: c.target.y, z: c.target.z, azimuth: sph.theta + cmd.radians }, instant);
          break;
        case "tilt":
          flyTo({ x: c.target.x, y: c.target.y, z: c.target.z, polar: sph.phi + cmd.radians }, instant);
          break;
        case "resetNorth":
          flyTo({ x: c.target.x, y: c.target.y, z: c.target.z, azimuth: 0 }, instant);
          break;
        case "pan": {
          // camera azimuth theta: forward is the direction from camera to target
          const step = sph.radius * 0.18;
          const fx = -Math.sin(sph.theta);
          const fz = -Math.cos(sph.theta);
          const dx = (fx * cmd.forward + -fz * cmd.right) * step;
          const dz = (fz * cmd.forward + fx * cmd.right) * step;
          flyTo({ x: c.target.x + dx, y: c.target.y, z: c.target.z + dz }, true);
          break;
        }
        case "home":
          flyTo(
            { x: HOME_VIEW.x, y: HOME_VIEW.y, z: HOME_VIEW.z, distance: HOME_VIEW.distance, azimuth: HOME_VIEW.azimuth, polar: HOME_VIEW.polar },
            instant,
          );
          break;
      }
    };
    // a command sent before the 3D view was ready (deep link, search) runs now
    handle(useWorldStore.getState());
    return useWorldStore.subscribe(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const f = flight.current;
    if (f) {
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const k = easeInOut(t);
      c.target.lerpVectors(f.from.target, f.to.target, k);
      camera.position.lerpVectors(f.from.pos, f.to.pos, k);
      // arc a little upwards on long flights so the city stays readable
      const lift = Math.sin(Math.PI * k) * Math.min(400, f.from.target.distanceTo(f.to.target) * 0.25);
      camera.position.y += lift;
      if (t >= 1) flight.current = null;
      c.update();
    }
    // keep the target inside the city
    if (manifest) {
      const [w, s, e, n] = manifest.bounds.lv95;
      const minX = w - manifest.origin.easting;
      const maxX = e - manifest.origin.easting;
      const minZ = manifest.origin.northing - n;
      const maxZ = manifest.origin.northing - s;
      const tx = THREE.MathUtils.clamp(c.target.x, minX, maxX);
      const tz = THREE.MathUtils.clamp(c.target.z, minZ, maxZ);
      if (tx !== c.target.x || tz !== c.target.z) {
        camera.position.x += tx - c.target.x;
        camera.position.z += tz - c.target.z;
        c.target.x = tx;
        c.target.z = tz;
      }
    }
    // follow the terrain: the orbit target glides to the surface under it, so
    // panning up Lausanne's hills never orbits a point buried in the ground
    const t0 = performance.now();
    if (!f && t0 - lastGroundProbe.current > 300) {
      lastGroundProbe.current = t0;
      groundY.current = surfaceHeightAt(c.target.x, c.target.z);
    }
    if (!f && groundY.current !== null && Math.abs(groundY.current - c.target.y) > 0.5) {
      const dy = (groundY.current - c.target.y) * 0.12;
      c.target.y += dy;
      camera.position.y += dy;
    }

    // depth precision: near/far follow the zoom level
    const dist = camera.position.distanceTo(c.target);
    const near = THREE.MathUtils.clamp(dist * 0.01, 0.5, 40);
    if (Math.abs(near - camera.near) / camera.near > 0.15) {
      camera.near = near;
      camera.far = 90_000;
      camera.updateProjectionMatrix();
    }
    const now = performance.now();
    if (now - lastViewReport.current > 250) {
      lastViewReport.current = now;
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
      const heading = (((-sph.theta * 180) / Math.PI) % 360 + 360) % 360;
      useWorldStore.getState().setView({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        targetX: c.target.x,
        targetY: c.target.y,
        targetZ: c.target.z,
        distance: dist,
        heading,
      });
    }
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      screenSpacePanning={false}
      zoomToCursor
      onStart={() => {
        flight.current = null;
      }}
    />
  );
}
