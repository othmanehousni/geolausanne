"use client";

import { create } from "zustand";

/**
 * Polite screen-reader announcements for things that happen on the map
 * (camera moved to a result, spot removed...). Rendered by <LiveRegion />.
 */
interface AnnouncerState {
  message: string;
  /** flips so repeating the same sentence is announced again */
  nonce: number;
  announce(message: string): void;
}

export const useAnnouncer = create<AnnouncerState>((set) => ({
  message: "",
  nonce: 0,
  announce: (message) => set((s) => ({ message, nonce: s.nonce + 1 })),
}));

export const announce = (message: string) => useAnnouncer.getState().announce(message);
