/**
 * Materials for voxel tiles.
 *
 * Tiles carry no textures and no normals: colour comes from COLOR_0 (RGB)
 * and the alpha byte encodes a *shader class* (keep in sync with
 * pipelines/geodata/src/geovox/materials.py). Detail is added procedurally
 * in world space, so it is free in bandwidth and identical across LODs:
 *
 *  - every face is flat shaded (normals from screen-space derivatives)
 *  - each voxel gets a tiny brightness jitter (blocky "texture")
 *  - walls get windows, lit at night
 *  - leaves get per-tree tint and an optional gentle sway
 */
import * as THREE from "three";

export const SHADER_CLASS = {
  plain: 0,
  wall: 32,
  roof: 64,
  leaves: 96,
  water: 128,
  road: 160,
} as const;

/** Uniforms shared by every voxel material (day/night, time). */
export const worldUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uSway: { value: 1 },
};

const COMMON_VERTEX_PARS = /* glsl */ `
varying vec3 vWorldPos;
varying float vClass;
varying float vTreeSeed;
uniform float uTime;
uniform float uSway;
`;

const COMMON_FRAGMENT_PARS = /* glsl */ `
varying vec3 vWorldPos;
varying float vClass;
varying float vTreeSeed;
uniform vec3 uVoxel;
uniform float uNight;
uniform float uTime;

float vxHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
`;

/** Patch a MeshLambertMaterial into the voxel material. */
function applyVoxelShader(material: THREE.MeshLambertMaterial, voxel: THREE.Vector3) {
  const uniforms = { uVoxel: { value: voxel } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace(
        "#include <project_vertex>",
        /* glsl */ `
        vClass = floor(color.a * 255.0 + 0.5);
        vTreeSeed = 0.0;
        #ifdef USE_INSTANCING
          vec3 itr = instanceMatrix[3].xyz;
          vTreeSeed = fract(sin(dot(itr.xz, vec2(12.9898, 78.233))) * 43758.5453);
          if (vClass > 90.0 && vClass < 100.0 && uSway > 0.5) {
            float h = max(transformed.y - 2.0, 0.0);
            float s = sin(uTime * 1.3 + vTreeSeed * 6.2831) * 0.035 * h;
            transformed.x += s;
            transformed.z += s * 0.6;
          }
        #endif
        #include <project_vertex>
        vec4 vwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          vwp = instanceMatrix * vwp;
        #endif
        vWorldPos = (modelMatrix * vwp).xyz;
        `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON_FRAGMENT_PARS}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        vec3 base = vColor.rgb;
        vec3 dpx = dFdx(vWorldPos);
        vec3 dpy = dFdy(vWorldPos);
        vec3 wn = normalize(cross(dpx, dpy));
        // the voxel owning this face: step half a voxel back along the normal
        vec3 cell = floor(vWorldPos / uVoxel - wn * 0.5 + 1e-3);
        float jitter = vxHash13(cell);
        base *= 0.955 + 0.075 * jitter;
        float viewDist = length(vWorldPos - cameraPosition);
        vec3 emissiveAdd = vec3(0.0);

        if (vClass > 28.0 && vClass < 36.0 && abs(wn.y) < 0.5) {
          // procedural windows on facades: 3 m storeys, 2.5 m bays
          float u = abs(wn.x) > 0.5 ? vWorldPos.z : vWorldPos.x;
          float fy = fract(vWorldPos.y / 3.0);
          float fu = fract(u / 2.5);
          float aa = clamp(fwidth(vWorldPos.y / 3.0) * 1.5, 0.0, 0.5);
          float wy = smoothstep(0.36 - aa, 0.36 + aa, fy) * (1.0 - smoothstep(0.76 - aa, 0.76 + aa, fy));
          float wu = smoothstep(0.27 - aa, 0.27 + aa, fu) * (1.0 - smoothstep(0.73 - aa, 0.73 + aa, fu));
          float win = wy * wu * (1.0 - smoothstep(900.0, 2200.0, viewDist));
          vec3 glass = mix(vec3(0.27, 0.34, 0.42), vec3(0.16, 0.19, 0.24), uNight);
          base = mix(base, glass, win * 0.85);
          vec3 cellW = floor(vec3(u / 2.5, vWorldPos.y / 3.0, dot(wn, vec3(1.0, 0.0, 2.0))));
          float lit = step(0.42, vxHash13(cellW + 7.0));
          emissiveAdd += win * lit * uNight * vec3(1.0, 0.78, 0.45) * 0.9;
        } else if (vClass > 60.0 && vClass < 68.0) {
          base *= 0.97 + 0.04 * vxHash13(cell + 3.0);
        } else if (vClass > 90.0 && vClass < 100.0) {
          // per-tree tint: some trees warmer, some cooler
          base *= mix(vec3(1.04, 1.0, 0.92), vec3(0.92, 1.0, 1.04), vTreeSeed) * (0.96 + 0.08 * vTreeSeed);
        } else if (vClass > 156.0 && vClass < 164.0) {
          base *= 0.97 + 0.03 * vxHash13(cell + 11.0);
        }
        diffuseColor.rgb *= base;
        diffuseColor.a = 1.0;
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n totalEmissiveRadiance += emissiveAdd;`,
      );
  };
  material.customProgramCacheKey = () => `voxel-${voxel.x}-${voxel.y}-${voxel.z}`;
}

export function createVoxelMaterial(voxel: THREE.Vector3 | number): THREE.MeshLambertMaterial {
  const v = typeof voxel === "number" ? new THREE.Vector3(voxel, voxel, voxel) : voxel;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "voxel";
  applyVoxelShader(m, v);
  return m;
}

/** Lake / river surface: animated ripples, fresnel and a sun glint. */
export function createWaterMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "water";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, { uVoxel: { value: new THREE.Vector3(1, 1, 1) } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace(
        "#include <project_vertex>",
        `vClass = 128.0; vTreeSeed = 0.0;\n#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON_FRAGMENT_PARS}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        vec3 p = vWorldPos;
        float t = uTime * 0.6;
        float w = sin(p.x * 0.09 + t) * cos(p.z * 0.07 - t * 0.8) + sin((p.x + p.z) * 0.031 + t * 0.5) * 0.6;
        float ripple = 0.5 + 0.5 * w;
        vec3 viewDir = normalize(cameraPosition - p);
        float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        vec3 deep = mix(vColor.rgb * 0.82, vec3(0.08, 0.12, 0.2), uNight);
        vec3 sky = mix(vec3(0.66, 0.82, 0.95), vec3(0.12, 0.16, 0.28), uNight);
        vec3 col = mix(deep, sky, fres * 0.6);
        // ripples and sun glints only up close: far away their regular
        // maxima alias into a grid of white dots
        float near = 1.0 - smoothstep(250.0, 900.0, length(cameraPosition - p));
        col *= 0.94 + 0.08 * ripple * mix(0.25, 1.0, near);
        float glint = pow(max(ripple, 0.0), 24.0) * (1.0 - uNight) * (1.0 - fres) * 0.35 * near;
        diffuseColor.rgb = col + glint;
        diffuseColor.a = 1.0;
        `,
      );
  };
  m.customProgramCacheKey = () => "water";
  return m;
}
