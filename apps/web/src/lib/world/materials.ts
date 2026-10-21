/**
 * Materials for voxel tiles.
 *
 * Tiles carry no textures and no normals. COLOR_0 holds an **sRGB albedo**
 * (converted to linear here before lighting) and its alpha byte packs
 *
 *     alpha = class << 5 | variant << 2 | ao
 *
 * (keep in sync with pipelines/geodata/src/geovox/materials.py and
 * docs/pipeline/materials.md#the-shader-byte):
 *
 *  - class: plain ground, wall, roof, leaves, water, road
 *  - variant: window style of a wall, roof material, ground pattern,
 *    broadleaf or conifer...
 *  - ao: ambient occlusion baked per vertex (0..3), interpolated
 *
 * Detail is procedural in world space, so it costs no bandwidth and is
 * identical across levels of detail: per-voxel jitter, windows lit at night,
 * roof and ground patterns, autumn colours, drifting cloud shadows. Patterns
 * fade out once they would be smaller than a few screen pixels (the canvas
 * is rendered at a low, pixel-art resolution).
 */
import * as THREE from "three";

/** Shader bytes (alpha, variant 0, no occlusion) of each class. */
export const SHADER_CLASS = {
  plain: 0,
  wall: 32,
  roof: 64,
  leaves: 96,
  water: 128,
  road: 160,
} as const;

/** Window styles (wall variants). */
export const WINDOWS = { residential: 0, old: 1, glass: 2, industrial: 3, church: 4, none: 5, barn: 6, block: 7 } as const;
/** Roof materials (roof variants). */
export const ROOF = { plain: 0, tiles: 1, solar: 2, green: 3, copper: 4, glass: 5 } as const;
/** Ground patterns (plain variants). */
export const GROUND = { plain: 0, lawn: 1, pitch: 2, rows: 3, vines: 4, paving: 5, ballast: 6, flowers: 7 } as const;

/** Unpack a shader byte: class (0..7), variant (0..7), ambient occlusion (0..3). */
export function decodeShaderByte(alpha: number): { cls: number; variant: number; ao: number } {
  return { cls: alpha >> 5, variant: (alpha >> 2) & 7, ao: alpha & 3 };
}

/** Uniforms shared by every voxel material: time, light, season. */
export const worldUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uSway: { value: 1 },
  /** unit vector towards the sun (moon at night) */
  uSunDir: { value: new THREE.Vector3(-0.45, 0.8, 0.55).normalize() },
  /** linear colour of the key light, for glints */
  uSunColor: { value: new THREE.Color(1, 0.95, 0.88) },
  /** sky colour reflected by glass and water (linear) */
  uSkyTint: { value: new THREE.Color(0.66, 0.82, 0.95) },
  /** 0 summer .. 1 peak autumn: share and depth of yellowing broadleaf crowns */
  uAutumn: { value: 0 },
  /** strength of the drifting cloud shadows (0 at night and on the low preset) */
  uClouds: { value: 0 },
};

const COMMON_VERTEX_PARS = /* glsl */ `
varying vec3 vWorldPos;
varying float vClass;
varying float vVariant;
varying float vAO;
varying float vTreeSeed;
uniform float uTime;
uniform float uSway;
`;

const COMMON_FRAGMENT_PARS = /* glsl */ `
varying vec3 vWorldPos;
varying float vClass;
varying float vVariant;
varying float vAO;
varying float vTreeSeed;
uniform vec3 uVoxel;
uniform float uNight;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTint;
uniform float uAutumn;
uniform float uClouds;
uniform float uAOStrength;

float vxHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vxHash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vxHash12(i), vxHash12(i + vec2(1.0, 0.0)), f.x), mix(vxHash12(i + vec2(0.0, 1.0)), vxHash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// the palette is sRGB: lighting happens in linear space
vec3 vxToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
`;

/** Vertex part shared by voxels and water: unpack the shader byte, world position. */
const VERTEX_UNPACK = /* glsl */ `
  float vxA = floor(color.a * 255.0 + 0.5);
  vClass = floor(vxA / 32.0);
  vVariant = floor(mod(vxA, 32.0) / 4.0);
  vAO = mod(vxA, 4.0);
`;

/** Fragment: the voxel colour (sets `base`, linear) and `emissiveAdd`. */
const VOXEL_FRAGMENT = /* glsl */ `
  vec3 base = vxToLinear(vColor.rgb);
  vec3 dpx = dFdx(vWorldPos);
  vec3 dpy = dFdy(vWorldPos);
  vec3 wn = normalize(cross(dpx, dpy));
  // the voxel owning this face: step half a voxel back along the normal
  vec3 cell = floor(vWorldPos / uVoxel - wn * 0.5 + 1e-3);
  float jitter = vxHash13(cell);
  // how many screen pixels one voxel covers: patterns smaller than a few
  // pixels would only shimmer, they fade to their average colour
  float pxSize = max(length(dpx) + length(dpy), 1e-4) * 0.7;
  float voxPx = uVoxel.x / pxSize;
  float detail = smoothstep(2.0, 4.5, voxPx);
  vec3 emissiveAdd = vec3(0.0);
  int cls = int(vClass + 0.5);
  int variant = int(vVariant + 0.5);
  base *= mix(1.0, 0.965 + 0.055 * jitter, detail);

  if (cls == 1 && abs(wn.y) < 0.5) {
    // walls: windows by style (3 m storeys by default)
    float u = abs(wn.x) > 0.5 ? vWorldPos.z : vWorldPos.x;
    float storey = 3.0;
    float bay = 2.6;
    vec4 win = vec4(0.36, 0.78, 0.28, 0.72); // y0, y1, u0, u1 within a storey and a bay
    float litP = 0.32;
    float glassTint = 0.85;
    if (variant == 1) { storey = 3.4; bay = 2.3; win = vec4(0.28, 0.82, 0.34, 0.66); litP = 0.4; }
    else if (variant == 2) { storey = 3.6; bay = 1.6; win = vec4(0.16, 0.94, 0.05, 0.97); litP = 0.25; glassTint = 0.95; }
    else if (variant == 3) { storey = 6.0; bay = 4.0; win = vec4(0.72, 0.88, 0.08, 0.92); litP = 0.18; }
    else if (variant == 4) { storey = 9.0; bay = 4.5; win = vec4(0.22, 0.86, 0.40, 0.60); litP = 0.75; }
    else if (variant == 7) { storey = 2.8; bay = 2.4; win = vec4(0.40, 0.82, 0.16, 0.84); litP = 0.45; }
    if (variant == 5 || variant == 6) {
      // blind walls, barns (boarding: one shade per voxel column)
      if (variant == 6) base *= 0.93 + 0.12 * vxHash12(vec2(floor(u / uVoxel.x), 3.0));
    } else {
      float fy = fract(vWorldPos.y / storey);
      float fu = fract(u / bay);
      float aa = clamp(fwidth(vWorldPos.y / storey) * 0.75, 0.0, 0.5);
      float wy = smoothstep(win.x - aa, win.x + aa, fy) * (1.0 - smoothstep(win.y - aa, win.y + aa, fy));
      float wu = smoothstep(win.z - aa, win.z + aa, fu) * (1.0 - smoothstep(win.w - aa, win.w + aa, fu));
      float storeyPx = storey / max(fwidth(vWorldPos.y), 1e-4);
      float sharp = smoothstep(3.5, 7.0, storeyPx);
      float coverage = (win.y - win.x) * (win.w - win.z);
      float w = mix(coverage, wy * wu, sharp);
      vec3 glass = mix(vec3(0.10, 0.14, 0.19), vec3(0.035, 0.045, 0.065), uNight);
      glass = mix(glass, uSkyTint * 0.55, 0.25 * (1.0 - uNight));
      base = mix(base, glass, w * glassTint);
      if (variant == 7) {
        // balcony bands under the windows of post-war blocks
        float band = step(fy, 0.10) * sharp;
        base *= 1.0 - 0.18 * band;
      }
      vec3 cellW = floor(vec3(u / bay, vWorldPos.y / storey, dot(wn, vec3(1.0, 0.0, 2.0))));
      float lit = step(1.0 - litP, vxHash13(cellW + 7.0));
      vec3 warm = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.76, 0.40), vxHash13(cellW + 3.0));
      if (variant == 4) warm = vec3(1.0, 0.62, 0.30);
      // at night windows are drawn as soon as a storey spans two pixels:
      // a lit window is then a single warm pixel (pixel-art city lights);
      // smaller still they blend into an average glow
      float shape = mix(coverage, wy * wu, smoothstep(1.6, 2.6, storeyPx));
      float glow = mix(coverage * litP, shape * lit * 1.3, smoothstep(1.1, 1.8, storeyPx));
      emissiveAdd += glow * uNight * warm * 0.85;
    }
  } else if (cls == 2) {
    // roofs: material by variant
    if (variant == 1) {
      // clay tiles: a mosaic of slightly different tiles
      float h2 = vxHash13(cell + 5.0);
      base *= mix(1.0, 0.92 + 0.12 * h2, detail);
      base.r *= mix(1.0, 0.96 + 0.08 * vxHash13(cell + 9.0), detail);
    } else if (variant == 2) {
      // solar panels: a light frame grid up close, and they glint
      vec2 q = vWorldPos.xz / vec2(1.0, 1.7);
      float frame = max(step(0.9, fract(q.x)), step(0.92, fract(q.y))) * smoothstep(6.0, 12.0, voxPx);
      base = mix(base, base * 1.8 + 0.02, frame * 0.6);
      vec3 v = normalize(cameraPosition - vWorldPos);
      float spec = pow(max(dot(reflect(-uSunDir, wn), v), 0.0), 48.0);
      emissiveAdd += uSunColor * spec * 0.6 * (1.0 - uNight);
    } else if (variant == 3) {
      // green roofs: patches of sedum and grass
      float p = vxHash13(floor(cell * 0.5) + 2.0);
      base *= mix(vec3(1.0), mix(vec3(0.86, 0.92, 0.80), vec3(1.10, 1.06, 0.88), p), detail);
    } else if (variant == 4) {
      // copper patina
      base *= mix(1.0, 0.9 + 0.18 * vxHash13(cell + 13.0), detail);
    } else if (variant == 5) {
      // glass roofs reflect the sky
      vec3 v = normalize(cameraPosition - vWorldPos);
      float fres = pow(1.0 - clamp(abs(dot(v, wn)), 0.0, 1.0), 2.0);
      base = mix(base, uSkyTint * 0.9, 0.35 + 0.4 * fres);
      emissiveAdd += uNight * vec3(0.9, 0.75, 0.5) * 0.25;
    } else {
      base *= 0.97 + 0.04 * vxHash13(cell + 3.0);
    }
  } else if (cls == 3) {
    // crowns: per tree (instanced) or per 6 m patch (stamped, canopies)
    float seed = vTreeSeed > 0.0 ? vTreeSeed : vxHash12(floor(vWorldPos.xz / 6.0) + 17.0);
    if (variant == 1) {
      base *= mix(vec3(0.92, 1.0, 1.06), vec3(1.0, 1.0, 0.94), seed) * (0.9 + 0.12 * seed);
    } else {
      base *= mix(vec3(1.05, 1.02, 0.88), vec3(0.92, 1.0, 1.04), seed) * (0.94 + 0.1 * seed);
      // autumn: a share of the broadleaf crowns turns yellow, orange or rust
      float turn = step(seed, 0.45 * uAutumn);
      vec3 fall = mix(vec3(0.50, 0.36, 0.07), vec3(0.46, 0.19, 0.05), vxHash12(vec2(seed * 91.0, 3.0)));
      fall = mix(fall, vec3(0.33, 0.19, 0.08), step(0.8, vxHash12(vec2(seed * 37.0, 5.0))));
      base = mix(base, fall, turn * (0.3 + 0.35 * uAutumn));
    }
    base *= mix(1.0, 0.93 + 0.1 * vxHash13(cell + 21.0), detail);
  } else if (cls == 5) {
    // asphalt: worn patches; at night a sodium glow and street lamps
    base *= 0.97 + 0.04 * vxHash13(cell + 11.0);
    vec2 lc = vWorldPos.xz / 9.0;
    float lamp = step(0.93, vxHash12(floor(lc) + 51.0)) * step(length(fract(lc) - 0.5), 0.13) * detail;
    emissiveAdd += uNight * vec3(1.0, 0.52, 0.16) * (0.045 + 0.6 * lamp);
  } else if (cls == 0 && wn.y > 0.5) {
    // ground patterns
    vec2 g = vWorldPos.xz;
    float along = step(0.5, vxHash12(floor(g / 64.0) + 41.0)); // field orientation per 64 m patch
    float coord = mix(g.x, g.y, along);
    if (variant == 1) {
      base *= mix(vec3(1.0), mix(vec3(0.94, 0.96, 0.92), vec3(1.07, 1.05, 0.9), vxHash13(cell + 19.0)), detail);
    } else if (variant == 2) {
      float stripe = mod(floor(coord / 4.0), 2.0);
      base *= 1.0 + mix(0.0, 0.07 * (stripe - 0.5), smoothstep(1.5, 3.0, voxPx * 4.0 / uVoxel.x));
    } else if (variant == 3) {
      float row = mod(floor(coord / max(2.0, uVoxel.x * 2.0)), 2.0);
      base *= 1.0 + mix(0.0, 0.08 * (row - 0.5), detail);
    } else if (variant == 4) {
      float row = mod(floor(coord / max(2.0, uVoxel.x * 2.0)), 2.0);
      base = mix(base, mix(base, vec3(0.30, 0.20, 0.11), 0.65), row * detail);
    } else if (variant == 5) {
      base *= 1.0 + mix(0.0, 0.05 * (mod(cell.x + cell.z, 2.0) - 0.5), detail);
    } else if (variant == 6) {
      base *= mix(1.0, 0.92 + 0.14 * vxHash13(cell + 23.0), detail);
    } else if (variant == 7) {
      // flower beds: one in three voxels flowers
      float f = vxHash13(cell + 29.0);
      vec3 petals = f < 0.11 ? vec3(0.80, 0.08, 0.10) : f < 0.2 ? vec3(0.95, 0.65, 0.05) : f < 0.27 ? vec3(0.85, 0.35, 0.55) : vec3(0.85, 0.85, 0.80);
      base = mix(base, petals, step(f, 0.34) * detail);
    }
  }

  // baked ambient occlusion: darker and cooler towards corners
  float ao = clamp(vAO / 3.0, 0.0, 1.0);
  base *= mix(vec3(1.0), vec3(0.50, 0.55, 0.68), ao * uAOStrength);

  // drifting cloud shadows (daytime only; still when motion is reduced)
  if (uClouds > 0.0) {
    vec2 q = (vWorldPos.xz + vec2(9.0, 4.0) * uTime) / 900.0;
    float n = vxNoise(q) * 0.65 + vxNoise(q * 2.3 + 7.1) * 0.35;
    base *= 1.0 - 0.16 * uClouds * smoothstep(0.56, 0.78, n);
  }
  diffuseColor.rgb *= base;
  diffuseColor.a = 1.0;
`;

/** Patch a MeshLambertMaterial into the voxel material. */
function applyVoxelShader(material: THREE.MeshLambertMaterial, voxel: THREE.Vector3) {
  // occlusion: crisp at 1-2 m voxels (the pipeline only bakes it there)
  const uniforms = { uVoxel: { value: voxel }, uAOStrength: { value: voxel.x <= 1 ? 0.62 : 0.5 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace(
        "#include <project_vertex>",
        /* glsl */ `
        ${VERTEX_UNPACK}
        vTreeSeed = 0.0;
        #ifdef USE_INSTANCING
          vec3 itr = instanceMatrix[3].xyz;
          vTreeSeed = 0.02 + 0.98 * fract(sin(dot(itr.xz, vec2(12.9898, 78.233))) * 43758.5453);
          if (vClass > 2.5 && vClass < 3.5 && uSway > 0.5) {
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
      .replace("#include <color_fragment>", VOXEL_FRAGMENT)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n totalEmissiveRadiance += emissiveAdd;`,
      );
  };
  material.customProgramCacheKey = () => `voxel2-${voxel.x}-${voxel.y}-${voxel.z}`;
}

export function createVoxelMaterial(voxel: THREE.Vector3 | number): THREE.MeshLambertMaterial {
  const v = typeof voxel === "number" ? new THREE.Vector3(voxel, voxel, voxel) : voxel;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "voxel";
  applyVoxelShader(m, v);
  return m;
}

/** Lake, rivers and pools: ripples, Fresnel to the sky, sun glints, depth from the palette. */
export function createWaterMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.name = "water";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms, { uVoxel: { value: new THREE.Vector3(1, 1, 1) }, uAOStrength: { value: 0 } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace(
        "#include <project_vertex>",
        `${VERTEX_UNPACK}\nvTreeSeed = 0.0;\n#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON_FRAGMENT_PARS}`)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        vec3 p = vWorldPos;
        float t = uTime * 0.6;
        bool pool = int(vVariant + 0.5) == 2;
        float w = sin(p.x * 0.09 + t) * cos(p.z * 0.07 - t * 0.8) + sin((p.x + p.z) * 0.031 + t * 0.5) * 0.6;
        float ripple = 0.5 + 0.5 * w;
        vec3 viewDir = normalize(cameraPosition - p);
        float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        vec3 water = vxToLinear(vColor.rgb);
        vec3 deep = mix(water * 0.9, vec3(0.004, 0.012, 0.035), uNight * (pool ? 0.4 : 0.85));
        vec3 sky = mix(uSkyTint, vec3(0.012, 0.02, 0.05), uNight);
        vec3 col = mix(deep, sky, fres * (pool ? 0.25 : 0.55));
        // ripples and sun glints only up close: far away their regular
        // maxima alias into a grid of white dots
        float near = 1.0 - smoothstep(250.0, 900.0, length(cameraPosition - p));
        col *= 0.94 + 0.1 * ripple * mix(0.25, 1.0, near);
        // sun glitter: the sun's reflection on gently sloping waves, a soft
        // path towards the sun with small twinkling sparkles (2 m cells, a
        // pixel or two on screen) inside it. Peaks of the smooth ripple field
        // lit from every direction drew soft white blobs all over the lake.
        vec3 wn = normalize(vec3(-0.07 * cos(p.x * 0.09 + t), 1.0, 0.06 * sin(p.z * 0.07 - t * 0.8)));
        float path = pow(max(dot(reflect(-viewDir, wn), uSunDir), 0.0), 48.0);
        float sparkle = step(0.9, vxHash12(floor(p.xz * 0.5) + floor(t * 1.5)));
        float glint = path * (0.25 + 2.2 * sparkle) * (1.0 - uNight) * near;
        vec3 emissiveAdd = uSunColor * glint * 0.6;
        if (pool) emissiveAdd += uNight * vec3(0.10, 0.55, 0.65) * 0.35;
        diffuseColor.rgb = col;
        diffuseColor.a = 1.0;
        `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n totalEmissiveRadiance += emissiveAdd;`,
      );
  };
  m.customProgramCacheKey = () => "water3";
  return m;
}
