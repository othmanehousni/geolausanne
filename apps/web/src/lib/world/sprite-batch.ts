/**
 * Camera-facing pixel sprites from the marker atlas, any number of them in
 * one instanced draw call. Each instance is a world anchor plus a sprite, a
 * size in CSS pixels per texel, a lift and a tint; the vertex shader places
 * the sprite in screen space, on the render target's pixel grid, so texels
 * stay square and crisp whatever the canvas resolution (including a
 * deliberately pixelated, upscaled canvas). Fragments use "sharp bilinear"
 * sampling: flat inside a texel, a one-pixel blend at its edges.
 *
 * Three's raycaster cannot hit these (their shape exists only in the vertex
 * shader); picking is done in screen space (see marker-screen.ts).
 */
import * as THREE from "three";
import { markerAtlas, type AtlasSprite } from "./marker-atlas";

/** Floats per instance: anchor (3), atlas rect (4), pivot + texel size + lift (4), tint (4). */
const STRIDE = 15;

const vertexShader = /* glsl */ `
attribute vec3 aAnchor;
attribute vec4 aRect;
attribute vec4 aPlace;
attribute vec4 aTint;
uniform vec2 uResolution;
uniform float uPxPerCss;
uniform float uDepthBias;
varying vec2 vTexel;
varying vec4 vTint;

void main() {
  vTint = aTint;
  vec4 view = viewMatrix * vec4(aAnchor, 1.0);
  // depth-tested sprites (contact shadows) sit a little in front of their
  // anchor, so the ground they stand on does not hide them
  float dist = length(view.xyz);
  view.xyz *= max(0.0, 1.0 - uDepthBias * (1.0 + 0.01 * dist) / max(dist, 1e-3));
  vec4 clip = projectionMatrix * view;
  if (clip.w <= 1e-3 || aTint.a <= 0.0) {
    // behind the camera, or hidden: outside the clip volume
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec2 anchor = (clip.xy / clip.w * 0.5 + 0.5) * uResolution;
  float k = aPlace.z * uPxPerCss;
  anchor.y += aPlace.w * uPxPerCss;
  // the sprite's corner on the pixel grid: whole texels land on whole pixels
  vec2 origin = floor(anchor - aPlace.xy * k + 0.5);
  vec2 px = origin + position.xy * aRect.zw * k;
  vTexel = aRect.xy + position.xy * aRect.zw;
  gl_Position = vec4(px / uResolution * 2.0 - 1.0, clamp(clip.z / clip.w, -1.0, 1.0), 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
varying vec2 vTexel;
varying vec4 vTint;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
  // sharp bilinear: the texel centre inside a texel, a one-pixel blend across its edges
  vec2 seam = floor(vTexel + 0.5);
  vec2 t = seam + clamp((vTexel - seam) / max(fwidth(vTexel), vec2(1e-4)), -0.5, 0.5);
  vec4 c = texture2D(uAtlas, t / uAtlasSize);
  float a = c.a * vTint.a;
  if (a < 0.004) discard;
  // the atlas holds sRGB colours premultiplied by alpha
  gl_FragColor = vec4(srgbToLinear(c.rgb / max(c.a, 1e-4)) * vTint.rgb, a);
  #include <colorspace_fragment>
}
`;

let sharedAtlas: THREE.DataTexture | null = null;
let atlasUsers = 0;

function acquireAtlas(): THREE.DataTexture {
  if (!sharedAtlas) {
    const a = markerAtlas();
    const tex = new THREE.DataTexture(a.data, a.width, a.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // colours are decoded in the shader (premultiplied sRGB)
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    sharedAtlas = tex;
  }
  atlasUsers++;
  return sharedAtlas;
}

function releaseAtlas() {
  atlasUsers--;
  if (atlasUsers <= 0 && sharedAtlas) {
    sharedAtlas.dispose();
    sharedAtlas = null;
    atlasUsers = 0;
  }
}

export interface SpriteBatchOptions {
  name: string;
  /** hidden behind the city (contact shadows) instead of always on top (markers) */
  depthTest?: boolean;
  renderOrder?: number;
}

const _size = new THREE.Vector2();

export class SpriteBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  /** sprites pushed since the last `begin()` */
  count = 0;
  private readonly data: Float32Array;
  private readonly buffer: THREE.InstancedInterleavedBuffer;
  /** render pixels per CSS pixel, as last drawn (lags a frame) */
  pxPerCss = 1;

  constructor(
    readonly capacity: number,
    opts: SpriteBatchOptions,
  ) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(capacity * STRIDE);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aAnchor", new THREE.InterleavedBufferAttribute(this.buffer, 3, 0));
    geometry.setAttribute("aRect", new THREE.InterleavedBufferAttribute(this.buffer, 4, 3));
    geometry.setAttribute("aPlace", new THREE.InterleavedBufferAttribute(this.buffer, 4, 7));
    geometry.setAttribute("aTint", new THREE.InterleavedBufferAttribute(this.buffer, 4, 11));
    geometry.instanceCount = 0;
    const atlas = acquireAtlas();
    const depthTest = opts.depthTest ?? false;
    const material = new THREE.ShaderMaterial({
      name: `sprites-${opts.name}`,
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: atlas },
        uAtlasSize: { value: new THREE.Vector2(atlas.image.width, atlas.image.height) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPxPerCss: { value: 1 },
        uDepthBias: { value: depthTest ? 1.5 : 0 },
      },
      transparent: true,
      depthTest,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = opts.name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder ?? 0;
    this.mesh.matrixAutoUpdate = false;
    // the sprite's shape exists only in the vertex shader: picking is done in screen space
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = (renderer) => {
      // the resolution actually rendered: a render target (pixelated canvas) or the canvas
      const target = renderer.getRenderTarget();
      if (target) _size.set(target.width, target.height);
      else renderer.getDrawingBufferSize(_size);
      const css = renderer.domElement.clientWidth || _size.x;
      this.pxPerCss = _size.x / css;
      const u = material.uniforms;
      (u.uResolution!.value as THREE.Vector2).copy(_size);
      u.uPxPerCss!.value = this.pxPerCss;
      material.uniformsNeedUpdate = true;
    };
  }

  begin() {
    this.count = 0;
  }

  /**
   * Queue one sprite. `texel` is its size in CSS pixels per texel, `lift`
   * raises it on screen (CSS pixels); the tint multiplies its colours.
   */
  push(x: number, y: number, z: number, sprite: AtlasSprite, texel: number, lift = 0, r = 1, g = 1, b = 1, a = 1): boolean {
    if (this.count >= this.capacity) return false;
    const d = this.data;
    const o = this.count * STRIDE;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = sprite.x;
    d[o + 4] = sprite.y;
    d[o + 5] = sprite.w;
    d[o + 6] = sprite.h;
    d[o + 7] = sprite.pivotX;
    d[o + 8] = sprite.pivotY;
    d[o + 9] = texel;
    d[o + 10] = lift;
    d[o + 11] = r;
    d[o + 12] = g;
    d[o + 13] = b;
    d[o + 14] = a;
    this.count++;
    return true;
  }

  /** Upload what was pushed since `begin()`. */
  end() {
    this.mesh.geometry.instanceCount = this.count;
    // nothing to draw: no draw call at all
    this.mesh.visible = this.count > 0;
    this.buffer.clearUpdateRanges();
    if (this.count > 0) {
      this.buffer.addUpdateRange(0, this.count * STRIDE);
      this.buffer.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    releaseAtlas();
  }
}
