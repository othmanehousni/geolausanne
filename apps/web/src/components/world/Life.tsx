"use client";

import { useFrame } from "@react-three/fiber";
import { LIFE_BUDGET } from "@/lib/world/life/budget";
import { lifeUniforms } from "@/lib/world/life/life-materials";
import { useWorldStore } from "@/stores/world-store";
import { Birds } from "./life/Birds";
import { Boats } from "./life/Boats";
import { Clouds } from "./life/Clouds";

/**
 * The city's ambient life, restrained and true to the place: CGN boats on
 * their timetable on Lake Geneva, small flocks over the parks and the shore,
 * a few slow clouds. Everything is instanced (about seven draw calls in
 * all) and scaled to the quality preset; with reduced motion the boats and
 * clouds hold still and the birds are not shown.
 */
export function Life() {
  const quality = useWorldStore((s) => s.quality);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const ready = useWorldStore((s) => s.manifest !== null);
  const budget = LIFE_BUDGET[quality];

  useFrame((_, delta) => {
    if (!useWorldStore.getState().reducedMotion) lifeUniforms.uLifeTime.value += Math.min(delta, 0.1);
  });

  if (!ready) return null;
  return (
    <group name="life">
      {budget.ships ? <Boats small={budget.smallBoats} /> : null}
      {budget.birds > 0 && !reducedMotion ? <Birds count={budget.birds} /> : null}
      {budget.clouds > 0 ? <Clouds count={budget.clouds} /> : null}
    </group>
  );
}
