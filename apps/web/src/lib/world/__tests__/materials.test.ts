// @vitest-environment node
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createVoxelMaterial, createWaterMaterial, decodeShaderByte, GROUND, ROOF, SHADER_CLASS, WINDOWS } from "../materials";

describe("shader byte", () => {
  it("unpacks class, variant and ambient occlusion (pipeline: materials.shader_byte)", () => {
    // wall, curtain-wall windows, occlusion 3
    expect(decodeShaderByte(32 + WINDOWS.glass * 4 + 3)).toEqual({ cls: 1, variant: WINDOWS.glass, ao: 3 });
    expect(decodeShaderByte(SHADER_CLASS.roof + ROOF.solar * 4)).toEqual({ cls: 2, variant: ROOF.solar, ao: 0 });
    expect(decodeShaderByte(GROUND.flowers * 4 + 1)).toEqual({ cls: 0, variant: GROUND.flowers, ao: 1 });
  });

  it("reads the first tile format unchanged (variant and occlusion zero)", () => {
    const names = Object.keys(SHADER_CLASS) as (keyof typeof SHADER_CLASS)[];
    names.forEach((name, i) => expect(decodeShaderByte(SHADER_CLASS[name])).toEqual({ cls: i, variant: 0, ao: 0 }));
  });
});

/** Run a material's onBeforeCompile on three's own Lambert shader. */
function compile(m: THREE.Material) {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.lambert.uniforms),
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  } as unknown as Parameters<THREE.Material["onBeforeCompile"]>[0];
  m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

describe("voxel shaders", () => {
  it("patch three's Lambert shader at every hook", () => {
    for (const m of [createVoxelMaterial(1), createWaterMaterial()]) {
      const s = compile(m);
      // every replaced chunk was found (a renamed chunk would silently leave the stock one)
      expect(s.fragmentShader).not.toContain("#include <color_fragment>");
      expect(s.vertexShader).toContain("vClass = floor(vxA / 32.0)");
      expect(s.fragmentShader).toContain("vxToLinear(vColor.rgb)");
      expect(s.fragmentShader).toContain("totalEmissiveRadiance += emissiveAdd");
      for (const u of ["uSunDir", "uSunColor", "uSkyTint", "uAutumn", "uClouds", "uNight", "uTime", "uAOStrength", "uVoxel"]) {
        expect(s.uniforms[u], u).toBeDefined();
      }
    }
  });

  it("share one program per level of detail", () => {
    expect(createVoxelMaterial(1).customProgramCacheKey()).toBe(createVoxelMaterial(1).customProgramCacheKey());
    expect(createVoxelMaterial(1).customProgramCacheKey()).not.toBe(createVoxelMaterial(2).customProgramCacheKey());
  });

  it("darken occluded corners more at 1 m than on coarser levels", () => {
    const fine = compile(createVoxelMaterial(1)).uniforms.uAOStrength!.value as number;
    const coarse = compile(createVoxelMaterial(4)).uniforms.uAOStrength!.value as number;
    expect(fine).toBeGreaterThan(coarse);
  });
});
