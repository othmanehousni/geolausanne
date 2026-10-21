"use client";

import { useEffect, useRef } from "react";
import { AuthDialog } from "@/components/auth/AuthDialog";
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
          <div className="absolute top-1/2 right-3 -translate-y-1/2 sm:right-4">
            <MapToolbar />
          </div>
          <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 sm:inset-x-4">
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
      <AuthDialog />
      <PlacesSync />
      <DeepLinkSync />
      <LiveRegion />
    </div>
  );
}
