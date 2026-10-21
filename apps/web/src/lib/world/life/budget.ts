/**
 * How much life each quality preset can afford. Everything is instanced and
 * costs a few draw calls; the low preset (small phones, and the CI machines
 * that render on the CPU) keeps only the big boats, which are nearly free.
 */
import type { Quality } from "@/stores/world-store";

export interface LifeBudget {
  /** paddle steamers and the Évian shuttle */
  ships: boolean;
  /** sailing boats and the motor boat, and the boats' wakes */
  smallBoats: boolean;
  /** birds in the air (at most) */
  birds: number;
  /** clouds in the sky */
  clouds: number;
}

export const LIFE_BUDGET: Record<Quality, LifeBudget> = {
  low: { ships: true, smallBoats: false, birds: 0, clouds: 0 },
  medium: { ships: true, smallBoats: true, birds: 25, clouds: 6 },
  high: { ships: true, smallBoats: true, birds: 42, clouds: 9 },
};
