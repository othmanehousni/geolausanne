"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { worldUniforms } from "@/lib/world/materials";
import { useWorldStore } from "@/stores/world-store";

const DAY = {
  zenith: new THREE.Color("#5d9bd6"),
  horizon: new THREE.Color("#cfe5f3"),
  fog: new THREE.Color("#d3e6f2"),
  hemiSky: new THREE.Color("#e8f3ff"),
  hemiGround: new THREE.Color("#7a6550"),
  sun: new THREE.Color("#fff1dc"),
  hemiIntensity: 1.55,
  sunIntensity: 2.4,
};
const NIGHT = {
  zenith: new THREE.Color("#060b1a"),
  horizon: new THREE.Color("#1d2a48"),
  fog: new THREE.Color("#1a2540"),
  hemiSky: new THREE.Color("#5d7ab8"),
  hemiGround: new THREE.Color("#241c18"),
  sun: new THREE.Color("#9fb4ff"),
  hemiIntensity: 0.55,
  sunIntensity: 0.35,
};

/** Sky dome, fog and lights; cross-fades between day and night. */
export function Atmosphere() {
  const night = useWorldStore((s) => s.night);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const mix = useRef(night ? 1 : 0);

  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: DAY.zenith.clone() },
          uHorizon: { value: DAY.horizon.clone() },
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
          uniform float uNight;
          float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
            // stars at night
            vec3 cell = floor(vDir * 260.0);
            float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.35, h) * uNight;
            col += star * 0.9;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  );

  useEffect(() => {
    scene.fog = new THREE.Fog(DAY.fog.clone(), 2500, 26000);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useEffect(() => invalidate(), [night, invalidate]);

  useFrame((_, delta) => {
    const goal = night ? 1 : 0;
    const speed = reducedMotion ? 1 : Math.min(1, delta * 1.6);
    mix.current += (goal - mix.current) * speed;
    if (Math.abs(goal - mix.current) < 0.001) mix.current = goal;
    const k = mix.current;
    worldUniforms.uNight.value = k;
    sky.uniforms.uZenith.value.copy(DAY.zenith).lerp(NIGHT.zenith, k);
    sky.uniforms.uHorizon.value.copy(DAY.horizon).lerp(NIGHT.horizon, k);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, k);
    if (hemi.current) {
      hemi.current.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, k);
      hemi.current.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, k);
      hemi.current.intensity = THREE.MathUtils.lerp(DAY.hemiIntensity, NIGHT.hemiIntensity, k);
    }
    if (sun.current) {
      sun.current.color.copy(DAY.sun).lerp(NIGHT.sun, k);
      sun.current.intensity = THREE.MathUtils.lerp(DAY.sunIntensity, NIGHT.sunIntensity, k);
    }
  });

  return (
    <>
      <mesh material={sky} renderOrder={-1000} frustumCulled={false} scale={50_000}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} args={[DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity]} />
      {/* afternoon sun from the south-west over the lake */}
      <directionalLight ref={sun} position={[-0.45, 0.8, 0.55]} intensity={DAY.sunIntensity} color={DAY.sun} />
    </>
  );
}
