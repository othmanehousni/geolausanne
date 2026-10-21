"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { announce } from "@/stores/announcer-store";
import { usePlacesStore } from "@/stores/places-store";
import { useWorldStore, type CameraView } from "@/stores/world-store";

/** Quiet time after the last camera or spot-list change before speaking. */
const SETTLE_MS = 800;

/** The camera rig reports the view every 250 ms, moving or not. */
function moved(a: CameraView | null, b: CameraView | null) {
  if (!a || !b) return a !== b;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > 0.05;
}

const POINTS = ["north", "northEast", "east", "southEast", "south", "southWest", "west", "northWest"] as const;
export type CompassPoint = (typeof POINTS)[number];

/** Eight-point compass name of a heading in degrees (0 = north, clockwise). */
export function compassPoint(heading: number): CompassPoint {
  return POINTS[Math.round((((heading % 360) + 360) % 360) / 45) % 8];
}

/**
 * Spoken feedback for moves made with the keyboard or the toolbar: once the
 * camera has settled and the spots around the new centre have loaded, the
 * heading and the number of spots in view are announced. Pointer gestures stay
 * silent (their result is on screen), and flights to a search result or a spot
 * are announced by the feature that started them.
 */
export function useViewAnnouncer() {
  const t = useTranslations("map");
  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const speakWhenSettled = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending = false;
        const view = useWorldStore.getState().view;
        if (!view) return;
        const direction = t(`compass.${compassPoint(view.heading)}`);
        announce(t("viewSettled", { direction, count: usePlacesStore.getState().places.length }));
      }, SETTLE_MS);
    };
    const stopWorld = useWorldStore.subscribe((s, prev) => {
      if (s.command !== prev.command && s.command) {
        // a command that cannot move the camera (tilt at its limit) is still confirmed
        pending = s.command.kind !== "flyTo";
        if (pending) speakWhenSettled();
        else clearTimeout(timer);
      } else if (pending && moved(s.view, prev.view)) {
        speakWhenSettled();
      }
    });
    const stopPlaces = usePlacesStore.subscribe((s, prev) => {
      if (pending && s.places !== prev.places) speakWhenSettled();
    });
    return () => {
      stopWorld();
      stopPlaces();
      clearTimeout(timer);
    };
  }, [t]);
}
