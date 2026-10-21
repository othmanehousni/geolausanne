"use client";

import { useCallback, useSyncExternalStore } from "react";

const serverSnapshot = () => null;

/**
 * Subscribe to a CSS media query. Returns null while rendering on the server
 * and during hydration, so callers can wait instead of rendering the wrong
 * variant first and swapping it right after.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const snapshot = useCallback(() => matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Tailwind's `md` breakpoint: side panels instead of bottom sheets. */
export const useIsDesktop = () => useMediaQuery("(min-width: 48rem)");
