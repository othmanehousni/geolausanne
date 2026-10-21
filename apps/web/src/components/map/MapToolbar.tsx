"use client";

import { Toolbar } from "@base-ui/react/toolbar";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CrosshairIcon,
  HouseIcon,
  MinusIcon,
  NavigationArrowIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "cn";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { wgs84ToLv95 } from "@geolausanne/geo-types";
import { elevationToWorldY, flyToLv95, insideCity, lv95ToWorldXZ } from "@/lib/world/navigation";
import { announce } from "@/stores/announcer-store";
import { useWorldStore } from "@/stores/world-store";

const ROTATE_STEP = Math.PI / 12;

interface ToolProps {
  label: string;
  shortcut?: string;
  onClick(): void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

function Tool({ label, shortcut, onClick, children, className, disabled }: ToolProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toolbar.Button
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className={cn(
              // 36 px buttons in a pill (44 px on touch screens); the hit area is the full button
              "relative grid size-9 place-items-center rounded-full text-foreground/75 outline-none select-none touch-manipulation pointer-coarse:size-11",
              "transition-[background-color,color,scale] duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground",
              "active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-50 [&_svg]:size-[18px]",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={10}>
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function Separator({ className }: { className?: string }) {
  return <Toolbar.Separator className={cn("mx-2.5 my-1 h-px bg-border", className)} />;
}

/** Compass needle that follows the camera heading; pressing it faces north. */
function CompassGlyph() {
  const heading = useWorldStore((s) => s.view?.heading ?? 0);
  // the glyph points north-west by default: rotate it to the north first.
  // The angle is unwrapped so that crossing north turns the needle the short
  // way instead of spinning it backwards through 345°.
  const [angle, setAngle] = useState(45 - heading);
  const delta = ((((45 - heading - angle) % 360) + 540) % 360) - 180;
  if (Math.abs(delta) > 0.01) setAngle(angle + delta);
  return (
    <NavigationArrowIcon
      weight="fill"
      aria-hidden="true"
      // linear over the 250 ms between heading reports: a continuous turn stays continuous
      className="text-downvote transition-transform duration-250 ease-linear motion-reduce:transition-none"
      style={{ transform: `rotate(${angle + delta}deg)` }}
    />
  );
}

/**
 * Map controls in a vertical Base UI Toolbar: one tab stop, arrow keys move
 * between buttons, every icon button has a name and a tooltip with its
 * keyboard shortcut (active while the map has focus).
 */
export function MapToolbar() {
  const t = useTranslations("toolbar");
  const send = useWorldStore((s) => s.send);
  const heading = useWorldStore((s) => Math.round(s.view?.heading ?? 0) % 360);
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) {
      toast.add({ title: t("locateFailed"), type: "error" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { e, n } = wgs84ToLv95(pos.coords.longitude, pos.coords.latitude);
        if (!insideCity(e, n)) {
          toast.add({ title: t("locateOutside"), type: "info" });
          return;
        }
        const { x, z } = lv95ToWorldXZ(e, n);
        const y = pos.coords.altitude !== null ? elevationToWorldY(pos.coords.altitude) : 0;
        useWorldStore.getState().setUserLocation({ x, y, z });
        flyToLv95(e, n, { distance: 420 });
        announce(t("located"));
      },
      () => {
        setLocating(false);
        toast.add({ title: t("locateFailed"), type: "error" });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  return (
    <Toolbar.Root
      orientation="vertical"
      aria-label={t("label")}
      className="glass pointer-events-auto flex flex-col gap-0.5 rounded-full p-1"
    >
      <Toolbar.Group aria-label={t("zoomGroup")} className="flex flex-col gap-0.5 max-md:hidden [@media(max-height:32rem)]:hidden">
        <Tool label={t("zoomIn")} shortcut="+" onClick={() => send({ kind: "zoom", factor: 0.6 })}>
          <PlusIcon aria-hidden="true" />
        </Tool>
        <Tool label={t("zoomOut")} shortcut="−" onClick={() => send({ kind: "zoom", factor: 1 / 0.6 })}>
          <MinusIcon aria-hidden="true" />
        </Tool>
      </Toolbar.Group>
      <Separator className="max-md:hidden [@media(max-height:32rem)]:hidden" />
      <Toolbar.Group aria-label={t("orientationGroup")} className="flex flex-col gap-0.5">
        <Tool label={`${t("north")} · ${t("compass", { degrees: heading })}`} shortcut="N" onClick={() => send({ kind: "resetNorth" })}>
          <CompassGlyph />
        </Tool>
        <Tool label={t("rotateLeft")} shortcut="Q" className="max-md:hidden [@media(max-height:32rem)]:hidden" onClick={() => send({ kind: "rotate", radians: -ROTATE_STEP })}>
          <ArrowCounterClockwiseIcon aria-hidden="true" />
        </Tool>
        <Tool label={t("rotateRight")} shortcut="E" className="max-md:hidden [@media(max-height:32rem)]:hidden" onClick={() => send({ kind: "rotate", radians: ROTATE_STEP })}>
          <ArrowClockwiseIcon aria-hidden="true" />
        </Tool>
      </Toolbar.Group>
      <Separator />
      <Toolbar.Group aria-label={t("placeGroup")} className="flex flex-col gap-0.5">
        <Tool label={t("home")} shortcut="H" onClick={() => send({ kind: "home" })}>
          <HouseIcon aria-hidden="true" />
        </Tool>
        <Tool label={locating ? t("locating") : t("locate")} onClick={locate} disabled={locating}>
          {locating ? <Spinner className="size-[18px]" /> : <CrosshairIcon aria-hidden="true" />}
        </Tool>
      </Toolbar.Group>
    </Toolbar.Root>
  );
}
