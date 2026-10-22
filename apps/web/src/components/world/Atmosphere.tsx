"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { fogRange, HOME_VIEW } from "@/lib/world/config";
import { worldUniforms } from "@/lib/world/materials";
import { autumn, dayLight, daylightInstant, mixLight, NIGHT_LIGHT, type LightState, type RGB } from "@/lib/world/sun";
import { useWorldStore } from "@/stores/world-store";

/** The light follows the clock: recomputed once a minute (also with reduced motion). */
const LIGHT_EVERY_MS = 60_000;

const setSrgb = (c: THREE.Color, rgb: RGB) => c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

/** Until the clock is read (first effect): a summer morning. */
const FIRST_LIGHT = dayLight(Date.UTC(2026, 5, 21, 8, 30));

/**
 * Sky, fog and lights. In day mode the sun stands where it stands over
 * Lausanne right now (clamped to daylight: lib/world/sun.ts); the dark theme
 * is a moonlit night with lit windows. Switching cross-fades (instantly with
 * reduced motion).
 */
export function Atmosphere() {
  const night = useWorldStore((s) => s.night);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const sunTime = useWorldStore((s) => s.sunTime);
  const quality = useWorldStore((s) => s.quality);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const mix = useRef(night ? 1 : 0);
  const day = useRef<LightState>(FIRST_LIGHT);

  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGlow: { value: new THREE.Color() },
          uSunDir: worldUniforms.uSunDir,
          uNight: worldUniforms.uNight,
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          uniform vec3 uGlow;
          uniform vec3 uSunDir;
          uniform float uNight;
          float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float bayer4(vec2 p) {
            vec2 q = mod(floor(p), 4.0);
            float i = q.x + 4.0 * q.y;
            // 4x4 ordered dithering thresholds
            float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
            return (m[int(i)] + 0.5) / 16.0;
          }
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            // banded, dithered gradient: the pixel-art sky
            float t = pow(h, 0.55) * 10.0;
            t = (floor(t) + step(bayer4(gl_FragCoord.xy), fract(t))) / 10.0;
            vec3 col = mix(uHorizon, uZenith, t);
            float d = max(dot(vDir, normalize(uSunDir)), 0.0);
            col += uGlow * (pow(d, 9.0) * 0.28 + pow(d, 80.0) * 0.5) * (1.0 - 0.6 * uNight);
            // the sun (a moon at night): a crisp disc
            float disc = step(0.99955, d);
            col = mix(col, mix(vec3(1.0, 0.97, 0.88) * 2.2, vec3(0.86, 0.9, 1.0), uNight), disc);
            // stars
            vec3 cell = floor(vDir * 260.0);
            float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.35, h) * uNight;
            col += star * 0.9;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );

  useEffect(() => {
    scene.fog = new THREE.Fog(new THREE.Color(), ...fogRange(HOME_VIEW.distance));
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  // the day's light: now (or the debug instant), then once a minute
  useEffect(() => {
    const update = () => {
      const t = sunTime ?? Date.now();
      day.current = dayLight(daylightInstant(t));
      worldUniforms.uAutumn.value = autumn(t);
      invalidate();
    };
    update();
    if (sunTime !== null) return;
    const id = setInterval(update, LIGHT_EVERY_MS);
    return () => clearInterval(id);
  }, [sunTime, invalidate]);

  useEffect(() => invalidate(), [night, invalidate]);

  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    const goal = night ? 1 : 0;
    const speed = reducedMotion ? 1 : Math.min(1, delta * 1.6);
    mix.current += (goal - mix.current) * speed;
    if (Math.abs(goal - mix.current) < 0.001) mix.current = goal;
    const k = mix.current;
    const l = k === 0 ? day.current : k === 1 ? NIGHT_LIGHT : mixLight(day.current, NIGHT_LIGHT, k);
    worldUniforms.uNight.value = k;
    worldUniforms.uSunDir.value.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]);
    setSrgb(worldUniforms.uSunColor.value, l.sunColor).multiplyScalar(l.sunIntensity / 2);
    setSrgb(worldUniforms.uSkyTint.value, l.horizon).lerp(setSrgb(tmp, l.zenith), 0.45);
    worldUniforms.uClouds.value = quality === "low" ? 0 : 1 - k;
    setSrgb(sky.uniforms.uZenith.value, l.zenith);
    setSrgb(sky.uniforms.uHorizon.value, l.horizon);
    setSrgb(sky.uniforms.uGlow.value, l.glow);
    if (scene.fog instanceof THREE.Fog) {
      setSrgb(scene.fog.color, l.fog);
      const target = (get().controls as unknown as { target?: THREE.Vector3 } | null)?.target;
      [scene.fog.near, scene.fog.far] = fogRange(target ? camera.position.distanceTo(target) : HOME_VIEW.distance);
    }
    if (hemi.current) {
      setSrgb(hemi.current.color, l.skyColor);
      setSrgb(hemi.current.groundColor, l.groundColor);
      hemi.current.intensity = l.hemiIntensity;
    }
    if (sun.current) {
      setSrgb(sun.current.color, l.sunColor);
      sun.current.intensity = l.sunIntensity;
      sun.current.position.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]);
    }
  });

  return (
    <>
      <mesh material={sky} renderOrder={-1000} frustumCulled={false} scale={50_000}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={sun} />
    </>
  );
}
