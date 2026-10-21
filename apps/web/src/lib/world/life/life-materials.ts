/**
 * Materials of the city's life: flat-shaded Lambert like the city itself
 * (lit by the same sky and sun, fogged the same way), patched for what moves:
 * glowing windows and navigation lights at night, flapping wings, clouds
 * that drift and fade with an ordered dither (no transparency sorting, and
 * it suits the pixel look).
 */
import * as THREE from "three";
import { worldUniforms } from "../materials";

/** Seconds of animation; held still with reduced motion. */
export const lifeUniforms = {
  uLifeTime: { value: 0 },
};

const GLOW_VERTEX = /* glsl */ `
attribute vec3 aGlow;
varying vec3 vGlow;
`;
const GLOW_FRAGMENT = /* glsl */ `
varying vec3 vGlow;
uniform float uNight;
`;

function withGlow(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uNight = worldUniforms.uNight;
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${GLOW_VERTEX}`).replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${GLOW_FRAGMENT}`)
    // lights come on at dusk
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * smoothstep(0.25, 0.75, uNight) * 1.4;");
}

/** Boats: vertex colours, lit windows and navigation lights at night. */
export function boatMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "life-boat";
  m.onBeforeCompile = withGlow;
  m.customProgramCacheKey = () => "life-boat";
  return m;
}

/** Foam behind boats: white, faded by its vertex alpha, lying on the water. */
export function wakeMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  m.name = "life-wake";
  return m;
}

/**
 * Birds: the wings (aPart ±1) turn about the body's axis, by an angle that
 * beats with each instance's own phase, rate and amplitude (aFlap).
 */
export function birdMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "life-bird";
  m.onBeforeCompile = (shader) => {
    withGlow(shader);
    shader.uniforms.uLifeTime = lifeUniforms.uLifeTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        attribute float aPart;
        attribute vec3 aFlap;
        uniform float uLifeTime;
        // a wing's angle: a slight dihedral, plus the beat
        float wingAngle() { return 0.12 + aFlap.z * sin(uLifeTime * aFlap.y + aFlap.x); }
        vec2 turnWing(vec2 xy, float side, float a) {
          float c = cos(a);
          float s = sin(a);
          return vec2(xy.x * c - side * xy.y * s, side * xy.x * s + xy.y * c);
        }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `#include <beginnormal_vertex>
        if (aPart != 0.0) objectNormal.xy = turnWing(objectNormal.xy, sign(aPart), wingAngle());`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        if (aPart != 0.0) transformed.xy = turnWing(transformed.xy, sign(aPart), wingAngle());`,
      );
  };
  m.customProgramCacheKey = () => "life-bird";
  return m;
}

/** At most this many clouds share one draw call. */
export const MAX_CLOUDS = 12;

/**
 * Clouds: one geometry holding every cloud (aPart = its index); each is
 * moved by its own offset and faded by an ordered 4 × 4 dither
 * (uClouds[i] = x, y, z offset and opacity). Bottoms catch a little of the
 * city's light at night.
 */
export function cloudMaterial(clouds: { value: THREE.Vector4[] }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "life-cloud";
  m.onBeforeCompile = (shader) => {
    withGlow(shader);
    shader.uniforms.uClouds = clouds;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        attribute float aPart;
        uniform vec4 uClouds[${MAX_CLOUDS}];
        varying float vFade;
        varying float vUnder;`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        vec4 cloud = uClouds[int(aPart + 0.5)];
        transformed += cloud.xyz;
        vFade = cloud.w;
        vUnder = step(normal.y, -0.5);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        varying float vFade;
        varying float vUnder;
        // the 4 × 4 Bayer matrix: thresholds for an ordered dither
        const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
        float bayer4(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          return (BAYER[int(q.x + q.y * 4.0)] + 0.5) / 16.0;
        }`,
      )
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vFade <= bayer4(gl_FragCoord.xy)) discard;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vUnder * uNight * vec3(0.10, 0.075, 0.06) + uNight * vec3(0.02, 0.025, 0.04);",
      );
  };
  m.customProgramCacheKey = () => "life-cloud";
  return m;
}
