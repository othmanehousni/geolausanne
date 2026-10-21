"use client";

import { useEffect, useRef } from "react";
import { useUiStore } from "@/stores/ui-store";
import { PlacePanel } from "@/components/place/PlacePanel";
import { SpotsList } from "@/components/place/SpotsList";
import { SubmitPlaceDialog } from "@/components/place/SubmitPlaceDialog";
import { PickingBanner } from "./AddSpotFlow";
import { Attribution } from "./Attribution";
import { BottomBar } from "./BottomBar";
import { LiveRegion } from "./LiveRegion";
import { MapRegion } from "./MapRegion";
import { MapStatus } from "./MapStatus";
import { DeepLinkSync, PlacesSync } from "./MapSync";
import { MapToolbar } from "./MapToolbar";
import { TopBar } from "./TopBar";
import { WorldCanvas } from "./WorldCanvas";

/**
 * The home page: the 3D city fills the screen and the interface floats over
 * it in a pointer-transparent layer (only the controls catch the pointer).
 */
export function MapExperience() {
  const searchRef = useRef<HTMLInputElement>(null);
  // an open side panel (spot or list) covers the left 25rem on wide screens
  const panelOpen = useUiStore((s) => s.selectedPlaceId !== null || s.listOpen);
  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  // Ctrl/⌘ K opens search from anywhere (a modifier shortcut, so it can be global)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-background select-none">
      <TopBar searchRef={searchRef} />
      <main className="absolute inset-0">
        <MapRegion onSearchShortcut={focusSearch}>
          <WorldCanvas />
        </MapRegion>
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute top-1/2 right-[max(0.75rem,env(safe-area-inset-right))] -translate-y-1/2 sm:right-[max(1rem,env(safe-area-inset-right))]">
            <MapToolbar />
          </div>
          <div
            data-panel={panelOpen || undefined}
            className="absolute right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] flex flex-col items-center gap-2 sm:right-[max(1rem,env(safe-area-inset-right))] sm:left-[max(1rem,env(safe-area-inset-left))] md:data-panel:pl-[25rem] xl:data-panel:pl-0"
          >
            <MapStatus />
            <PickingBanner />
            <BottomBar />
            {/* credits sit bottom-right on wide screens, clear of the side panels */}
            <div className="flex w-full justify-start md:justify-end">
              <Attribution />
            </div>
          </div>
        </div>
      </main>
      <PlacePanel />
      <SpotsList />
      <SubmitPlaceDialog />
      <PlacesSync />
      <DeepLinkSync />
      <LiveRegion />
    </div>
  );
}
