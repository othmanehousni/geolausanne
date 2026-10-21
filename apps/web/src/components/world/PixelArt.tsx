"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { QUALITY } from "@/lib/world/config";
import { useWorldStore } from "@/stores/world-store";

/**
 * The pixel-art look. The canvas is rendered at a low resolution (one
 * rendered pixel = 1.5-3 CSS pixels, see `QUALITY[*].pixelSize`) and the
 * browser scales it up without smoothing (`image-rendering: pixelated`).
 *
 * The frame goes through one cheap pass at that same low resolution, which
 *  - fills pinholes: greedy meshing leaves T-junctions between quads, and
 *    where the rasteriser snaps their vertices the sky shows through single
 *    pixels (invisible at full resolution, a bright block once upscaled);
 *  - draws 1-pixel dark outlines where the depth jumps (silhouettes against
 *    the street, the sky or the building behind), on the medium and high
 *    presets, fading out with distance.
 */
export function PixelArt() {
  const gl = useThree((s) => s.gl);
  const quality = useWorldStore((s) => s.quality);

  useEffect(() => {
    const style = gl.domElement.style;
    // crisp-edges first: browsers that know `pixelated` override it
    style.imageRendering = "crisp-edges";
    style.imageRendering = "pixelated";
    return () => {
      style.imageRendering = "";
    };
  }, [gl]);

  return <FramePass outlines={QUALITY[quality].outlines} />;
}

const PASS_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uOutlines;
  varying vec2 vUv;

  float viewDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }

  void main() {
    vec2 dl = vec2(uTexel.x, 0.0);
    vec2 du = vec2(0.0, uTexel.y);
    vec4 col = texture2D(tColor, vUv);
    float d = viewDepth(vUv);
    float l = viewDepth(vUv - dl);
    float r = viewDepth(vUv + dl);
    float u = viewDepth(vUv + du);
    float b = viewDepth(vUv - du);
    // a pinhole: much farther than at least three of its four neighbours
    float tol = 2.0 + d * 0.02;
    float nearer = step(l + tol, d) + step(r + tol, d) + step(u + tol, d) + step(b + tol, d);
    if (nearer >= 3.0) {
      // take the colour of the nearest neighbour (no blending: pixel art)
      vec2 o = -dl;
      float m = l;
      if (r < m) { m = r; o = dl; }
      if (u < m) { m = u; o = du; }
      if (b < m) { m = b; o = -du; }
      col = texture2D(tColor, vUv + o);
      d = m;
    } else if (uOutlines > 0.5) {
      // this pixel is in front of a neighbour by a clear margin: a silhouette
      float jump = max(max(l, r), max(u, b)) - d;
      float edge = step(1.5 + d * 0.035, jump);
      float fade = 1.0 - smoothstep(700.0, 3200.0, d);
      col.rgb = mix(col.rgb, col.rgb * vec3(0.42, 0.42, 0.52), edge * fade * 0.8);
    }
    gl_FragColor = vec4(col.rgb, 1.0);
    #include <colorspace_fragment>
  }
`;

function FramePass({ outlines }: { outlines: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);

  const target = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1),
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      samples: 0,
    });
    // stored as sRGB (8 bits keep their precision in the darks), read back linear
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, []);

  const pass = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: target.depthTexture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 1 },
        uFar: { value: 1000 },
        uOutlines: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: PASS_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    // one triangle covering the screen
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(mesh);
    return { material, geometry, quadScene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, [target]);

  useEffect(() => {
    pass.material.uniforms.uOutlines.value = outlines ? 1 : 0;
    invalidate();
  }, [outlines, pass, invalidate]);

  useEffect(() => {
    const s = gl.getDrawingBufferSize(new THREE.Vector2());
    target.setSize(Math.max(1, s.x), Math.max(1, s.y));
    pass.material.uniforms.uTexel.value.set(1 / Math.max(1, s.x), 1 / Math.max(1, s.y));
    invalidate();
  }, [gl, size, dpr, target, pass, invalidate]);

  useEffect(
    () => () => {
      target.dispose();
      target.depthTexture?.dispose();
      pass.material.dispose();
      pass.geometry.dispose();
    },
    [target, pass],
  );

  // priority 1: this pass renders the frame instead of R3F
  useFrame(() => {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    pass.material.uniforms.uNear.value = camera.near;
    pass.material.uniforms.uFar.value = camera.far;
    gl.render(pass.quadScene, pass.camera);
  }, 1);

  return null;
}
