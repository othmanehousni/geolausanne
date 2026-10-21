"use client";

import { MapControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { HOME_VIEW } from "@/lib/world/config";
import { copyOrbit, easeInOut, easeOut, lerpOrbit, orbitOf, orbitPosition, type Orbit } from "@/lib/world/orbit";
import { LATER, surfaceAt } from "@/lib/world/picking";
import { useWorldStore } from "@/stores/world-store";

const MIN_DISTANCE = 25;
const MAX_DISTANCE = 9000;
const MIN_POLAR = 0.08;
const MAX_POLAR = Math.PI * 0.47;
/** keyboard and toolbar steps: short, so that quick presses add up */
const STEP_MS = 240;

const HOME: Orbit = {
  target: new THREE.Vector3(HOME_VIEW.x, HOME_VIEW.y, HOME_VIEW.z),
  distance: HOME_VIEW.distance,
  azimuth: HOME_VIEW.azimuth,
  polar: HOME_VIEW.polar,
};

interface Flight {
  from: Orbit;
  to: Orbit;
  start: number;
  duration: number;
  ease: (t: number) => number;
  /** how high the camera arcs halfway (long flights), metres */
  lift: number;
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
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const orbit = useMemo(() => copyOrbit(HOME), []);

  // initial placement
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.target.copy(HOME.target);
    orbitPosition(HOME, camera.position);
    c.update();
  }, [camera]);

  useEffect(() => {
    /** Go to `to`: at once, as a long flight (places, home) or as a short step (keys, toolbar). */
    const move = (to: Orbit, kind: "flight" | "step", instant: boolean) => {
      const c = controls.current;
      if (!c) return;
      to.distance = THREE.MathUtils.clamp(to.distance, MIN_DISTANCE, MAX_DISTANCE);
      to.polar = THREE.MathUtils.clamp(to.polar, MIN_POLAR, MAX_POLAR);
      // the ground under the old target says nothing about the new one: probe again at once
      groundY.current = null;
      lastGroundProbe.current = 0;
      if (instant) {
        flight.current = null;
        c.target.copy(to.target);
        orbitPosition(to, camera.position);
        c.update();
        invalidate();
        return;
      }
      const from = orbitOf(camera.position, c.target);
      const now = performance.now();
      const travel = from.target.distanceTo(to.target);
      if (kind === "flight") {
        flight.current = {
          from,
          to,
          start: now,
          duration: THREE.MathUtils.clamp(500 + (travel + Math.abs(from.distance - to.distance)) * 0.35, 600, 1600),
          ease: easeInOut,
          // arc a little upwards on long flights so the city stays readable
          lift: Math.min(400, travel * 0.25),
        };
      } else {
        // a step during a longer flight keeps its pace
        const left = flight.current ? flight.current.start + flight.current.duration - now : 0;
        flight.current = { from, to, start: now, duration: Math.max(STEP_MS, left), ease: easeOut, lift: 0 };
      }
      invalidate();
    };

    const handle = (state: ReturnType<typeof useWorldStore.getState>) => {
      const cmd = state.command;
      const c = controls.current;
      if (!cmd || cmd.id === lastCommand.current || !c) return;
      lastCommand.current = cmd.id;
      const instant = state.reducedMotion;
      // steps continue from where a running move is heading, so quick presses add up
      const goal = flight.current ? copyOrbit(flight.current.to) : orbitOf(camera.position, c.target);
      switch (cmd.kind) {
        case "flyTo": {
          const t = cmd.target;
          const to = { target: new THREE.Vector3(t.x, t.y, t.z), distance: t.distance ?? goal.distance, azimuth: t.azimuth ?? goal.azimuth, polar: t.polar ?? goal.polar };
          move(to, "flight", instant);
          break;
        }
        case "zoom":
          goal.distance *= cmd.factor;
          move(goal, "step", instant);
          break;
        case "rotate":
          goal.azimuth += cmd.radians;
          move(goal, "step", instant);
          break;
        case "tilt":
          goal.polar += cmd.radians;
          move(goal, "step", instant);
          break;
        case "resetNorth":
          goal.azimuth = 0;
          move(goal, "step", instant);
          break;
        case "pan": {
          // forward is the direction the camera faces (from the camera to the target)
          const step = goal.distance * 0.18;
          const fx = -Math.sin(goal.azimuth);
          const fz = -Math.cos(goal.azimuth);
          const d = new THREE.Vector3((fx * cmd.forward - fz * cmd.right) * step, 0, (fz * cmd.forward + fx * cmd.right) * step);
          // instant; a running move carries on from the new place
          c.target.add(d);
          camera.position.add(d);
          flight.current?.from.target.add(d);
          flight.current?.to.target.add(d);
          groundY.current = null;
          lastGroundProbe.current = 0;
          c.update();
          invalidate();
          break;
        }
        case "home":
          move(copyOrbit(HOME), "flight", instant);
          break;
      }
    };
    // a command sent before the 3D view was ready (deep link, search) runs now
    handle(useWorldStore.getState());
    return useWorldStore.subscribe(handle);
  }, [camera, invalidate]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const f = flight.current;
    if (f) {
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const k = f.ease(t);
      // around the target (not across it), the short way round
      lerpOrbit(f.from, f.to, k, orbit);
      c.target.copy(orbit.target);
      orbitPosition(orbit, camera.position);
      camera.position.y += Math.sin(Math.PI * k) * f.lift;
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
    // (it is probed again right after every scripted move)
    const t0 = performance.now();
    if (!f && t0 - lastGroundProbe.current > 300) {
      const hit = surfaceAt(c.target.x, c.target.z, { canWait: true });
      // LATER: a BVH was just built for another probe, try again next frame
      if (hit !== LATER) {
        lastGroundProbe.current = t0;
        groundY.current = hit?.y ?? null;
      }
    }
    if (!f && groundY.current !== null && Math.abs(groundY.current - c.target.y) > 0.5) {
      // with reduced motion the target settles at once
      const dy = (groundY.current - c.target.y) * (reducedMotion ? 1 : 0.12);
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

  // Stable: drei reconnects the controls whenever this prop changes, and a
  // reconnect in the middle of a drag loses the pointer release (pan, rotate
  // and zoom then stay dead until a reload).
  const onStart = useCallback(() => {
    flight.current = null;
  }, []);

  return (
    <MapControls
      ref={controls}
      makeDefault
      // no inertia when motion is reduced
      enableDamping={!reducedMotion}
      dampingFactor={0.09}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      screenSpacePanning={false}
      zoomToCursor
      onStart={onStart}
    />
  );
}
