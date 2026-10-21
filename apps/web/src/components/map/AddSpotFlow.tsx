"use client";

import { CrosshairSimpleIcon, MapPinPlusIcon, NavigationArrowIcon, XIcon } from "@phosphor-icons/react";
import { lv95ToWgs84, wgs84ToLv95 } from "@geolausanne/geo-types";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useAuth } from "@/lib/auth/auth-context";
import { insideCity, lv95ToWorldXZ, worldToLv95 } from "@/lib/world/navigation";
import { surfaceHeightAt } from "@/lib/world/picking";
import { announce } from "@/stores/announcer-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";
import { pickMapCentre } from "./MapRegion";

/** Starts "add a spot": sign in first if needed, then choose the location on the map. */
export function useStartAddSpot() {
  const { user } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  return useCallback(() => {
    const begin = () => {
      useUiStore.getState().selectPlace(null);
      useUiStore.getState().setListOpen(false);
      useWorldStore.getState().setPicking(true);
    };
    if (!user) openAuth("submit", begin);
    else begin();
  }, [user, openAuth]);
}

/**
 * Banner shown while choosing where a new spot is. Clicking the map picks the
 * point under the cursor; keyboard and screen-reader users pick the centre of
 * the view (marked with a crosshair) or their own position.
 */
export function PickingBanner() {
  const t = useTranslations("submit");
  const tToolbar = useTranslations("toolbar");
  const picking = useWorldStore((s) => s.picking);
  const picked = useWorldStore((s) => s.pickedPoint);
  const setPicking = useWorldStore((s) => s.setPicking);
  const coarse = useMediaQuery("(pointer: coarse)") ?? false;
  const [locating, setLocating] = useState(false);

  // a point was chosen: hand it to the form and leave picking mode
  useEffect(() => {
    if (!picked) return;
    const { easting, northing, elevation } = worldToLv95(picked.x, picked.y, picked.z);
    const { lon, lat } = lv95ToWgs84(easting, northing);
    const ui = useUiStore.getState();
    ui.setSubmitLocation({ easting, northing, elevation: Math.round(elevation * 10) / 10, lon, lat });
    setPicking(false);
    ui.setSubmitOpen(true);
  }, [picked, setPicking]);

  useEffect(() => {
    if (!picking) return;
    announce(t("pickHint"));
    // keyboard users can pan the map straight away and press Enter
    document.getElementById("main")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, setPicking, t]);

  if (!picking) return null;

  function pickMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.add({ title: tToolbar("locateFailed"), type: "error" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { e, n } = wgs84ToLv95(pos.coords.longitude, pos.coords.latitude);
        if (!insideCity(e, n)) {
          toast.add({ title: tToolbar("locateOutside"), type: "info" });
          return;
        }
        const { x, z } = lv95ToWorldXZ(e, n);
        const y = surfaceHeightAt(x, z) ?? useWorldStore.getState().view?.targetY ?? 0;
        useWorldStore.getState().setPickedPoint({ x, y, z });
      },
      () => {
        setLocating(false);
        toast.add({ title: tToolbar("locateFailed"), type: "error" });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  return (
    <>
      {/* the point "use the centre" picks */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-foreground/80 drop-shadow">
        <CrosshairSimpleIcon className="size-9" weight="light" />
      </div>
      <section
        aria-labelledby="picking-title"
        className="glass pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-3xl p-3 sm:flex-row sm:items-center animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-saffron text-saffron-foreground">
            <MapPinPlusIcon className="size-5" weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="picking-title" className="font-semibold">
              {t("pickTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{coarse ? t("pickHintTouch") : t("pickHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <Button variant="secondary" className="h-10 flex-1 rounded-xl sm:flex-none" onClick={() => pickMapCentre()}>
            <CrosshairSimpleIcon aria-hidden="true" />
            {t("useCentre")}
          </Button>
          <Button variant="secondary" className="h-10 flex-1 rounded-xl sm:flex-none" onClick={pickMyLocation} disabled={locating}>
            {locating ? <Spinner /> : <NavigationArrowIcon aria-hidden="true" />}
            {t("useLocation")}
          </Button>
          <Button variant="ghost" size="icon-lg" className="size-10 rounded-xl" aria-label={t("pickCancel")} onClick={() => setPicking(false)}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      </section>
    </>
  );
}
