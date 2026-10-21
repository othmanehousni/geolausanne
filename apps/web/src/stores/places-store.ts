"use client";

import { create } from "zustand";
import type { Place } from "@/lib/data/types";

/**
 * Places currently loaded for the map. Lives in a store (not React Query
 * context) because the R3F canvas renders in its own React root.
 */
interface PlacesState {
  places: Place[];
  setPlaces(p: Place[]): void;
  hoveredId: string | null;
  setHovered(id: string | null): void;
}

export const usePlacesStore = create<PlacesState>((set) => ({
  places: [],
  setPlaces: (places) => set({ places }),
  hoveredId: null,
  setHovered: (hoveredId) => set({ hoveredId }),
}));
