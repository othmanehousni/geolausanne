"use client";

import { useEffect } from "react";
import { useWorldStore } from "@/stores/world-store";

/** Longer than the overlays' exit transitions (up to 450 ms for drawers). */
const RELEASE_DELAY_MS = 500;

/**
 * Declares that a modal overlay hides the map while `active`. The 3D view
 * then renders only on demand (a resize, a finished tile) instead of every
 * frame: nothing moves behind a modal, and phones save battery. Full-rate
 * rendering resumes once the overlay's exit transition is over, so the two
 * never compete for the main thread.
 */
export function useCoverMap(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { cover } = useWorldStore.getState();
    cover(1);
    return () => {
      setTimeout(() => cover(-1), RELEASE_DELAY_MS);
    };
  }, [active]);
}
