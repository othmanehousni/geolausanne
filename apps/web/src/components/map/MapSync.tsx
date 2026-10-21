"use client";

import { useEffect, useRef, useState } from "react";
import { boundsAround, usePlace, usePlacesInBounds } from "@/lib/data/hooks";
import { HOME_VIEW } from "@/lib/world/config";
import { flyToPlace, worldToLv95 } from "@/lib/world/navigation";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

/**
 * Loads the spots around the camera target into the places store, which the
 * 3D markers (separate React root) and the spots list read.
 */
export function PlacesSync() {
  // subscribe to a coarse key so this re-renders only when the query box can change
  useWorldStore((s) => {
    const v = s.view;
    return v ? `${Math.round(v.targetX / 50)}:${Math.round(v.targetZ / 50)}:${Math.round(Math.log2(Math.max(v.distance, 1)) * 2)}` : null;
  });
  const setPlaces = usePlacesStore((s) => s.setPlaces);
  const view = useWorldStore.getState().view;
  // without a 3D view (no WebGL) the list still shows the spots around the centre
  const centre = view ? worldToLv95(view.targetX, 0, view.targetZ) : worldToLv95(HOME_VIEW.x, 0, HOME_VIEW.z);
  const bounds = boundsAround(centre.easting, centre.northing, view?.distance ?? HOME_VIEW.distance);
  const { data } = usePlacesInBounds(bounds);

  useEffect(() => {
    if (data) setPlaces(data);
  }, [data, setPlaces]);
  return null;
}

/**
 * `?spot=<id>` deep links: opens the linked spot on load and keeps the URL in
 * sync with the open spot so it can be shared or bookmarked.
 */
export function DeepLinkSync() {
  const selectedId = useUiStore((s) => s.selectedPlaceId);
  const selectPlace = useUiStore((s) => s.selectPlace);
  const [linkedId] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("spot"),
  );
  const linked = usePlace(linkedId);
  const flown = useRef(false);

  useEffect(() => {
    if (linkedId) selectPlace(linkedId);
  }, [linkedId, selectPlace]);

  useEffect(() => {
    if (linked.data && !flown.current) {
      flown.current = true;
      flyToPlace(linked.data);
    }
  }, [linked.data]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("spot", selectedId);
    else url.searchParams.delete("spot");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [selectedId]);
  return null;
}
