"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CLOUD_VOXEL, cloudOpacity, cloudPosition, makeClouds } from "@/lib/world/life/clouds";
import { cloudMaterial, lifeUniforms, MAX_CLOUDS } from "@/lib/world/life/life-materials";
import { cellGeometry } from "@/lib/world/life/voxel-model";

/**
 * A few voxel cumulus drifting slowly from the south-west, high over the
 * city: seen when the view is tilted towards the horizon, faded away before
 * the camera can rise into them, so they never veil the city or the spots.
 * One draw call for all of them; they stop with reduced motion.
 */
export function Clouds({ count }: { count: number }) {
  const clouds = useMemo(() => makeClouds(Math.min(count, MAX_CLOUDS)), [count]);
  const uniform = useMemo(() => ({ value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4()) }), []);
  const mesh = useMemo(() => {
    // a little unevenness per voxel, like the city's blocks
    const shade = (i: number, j: number, k: number) => {
      const h = Math.abs(Math.sin(i * 12.9898 + j * 78.233 + k * 37.719) * 43758.5453) % 1;
      const v = Math.round(240 + h * 15);
      return `rgb(${v}, ${v}, ${Math.min(255, v + 3)})`;
    };
    const geometry = cellGeometry(clouds.map((c, part) => ({ cells: c.cells, size: CLOUD_VOXEL, part, color: shade })));
    const m = new THREE.Mesh(geometry, cloudMaterial(uniform));
    m.name = "clouds";
    // moved in the vertex shader: the geometry's bounds say nothing
    m.frustumCulled = false;
    return m;
  }, [clouds, uniform]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  useFrame(({ camera }) => {
    const t = lifeUniforms.uLifeTime.value;
    let any = false;
    clouds.forEach((c, k) => {
      const p = cloudPosition(c, t, camera.position.x, camera.position.z);
      const fade = cloudOpacity(p.x, p.z, c.base, camera.position);
      uniform.value[k]!.set(p.x, c.base, p.z, fade);
      any ||= fade > 0;
    });
    mesh.visible = any;
  });

  return <primitive object={mesh} />;
}
