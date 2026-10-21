"use client";

import { create } from "zustand";
import { applyTheme, readThemePreference, type ThemePreference } from "@/lib/theme";

export interface SubmitLocation {
  easting: number;
  northing: number;
  /** metres above sea level of the picked surface (roof or ground), if known */
  elevation: number | null;
  lon: number;
  lat: number;
}

interface UiState {
  theme: ThemePreference;
  setTheme(t: ThemePreference): void;

  /** id of the place whose details panel is open */
  selectedPlaceId: string | null;
  selectPlace(id: string | null): void;

  listOpen: boolean;
  setListOpen(v: boolean): void;

  authOpen: boolean;
  /** why sign-in was requested, shown in the dialog */
  authReason: "vote" | "review" | "submit" | "report" | null;
  /** continues the interrupted action when sign-in completes without leaving the page */
  authThen: (() => void) | null;
  openAuth(reason?: UiState["authReason"], then?: () => void): void;
  closeAuth(): void;

  submitOpen: boolean;
  setSubmitOpen(v: boolean): void;
  /** where the new spot is, chosen on the map (or from the visitor's position) */
  submitLocation: SubmitLocation | null;
  setSubmitLocation(l: SubmitLocation | null): void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: typeof window === "undefined" ? "system" : readThemePreference(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  selectedPlaceId: null,
  selectPlace: (selectedPlaceId) => set({ selectedPlaceId }),

  listOpen: false,
  setListOpen: (listOpen) => set({ listOpen }),

  authOpen: false,
  authReason: null,
  authThen: null,
  openAuth: (authReason = null, then) => set({ authOpen: true, authReason, authThen: then ?? null }),
  closeAuth: () => set({ authOpen: false, authThen: null }),

  submitOpen: false,
  setSubmitOpen: (submitOpen) => set({ submitOpen }),
  submitLocation: null,
  setSubmitLocation: (submitLocation) => set({ submitLocation }),
}));
