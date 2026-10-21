"use client";

import { HandGrabbingIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

const SEEN_KEY = "geolausanne-hint-seen";
const SHOW_MS = 9000;
const LEAVE_MS = 200;

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * First visit only: once the city is drawn, a quiet chip above the dock says
 * how to explore. It leaves at the first touch, scroll or key press (or after
 * a few seconds) and never comes back. Sighted users only: the map's own
 * description already gives the full help to assistive technology.
 */
export function MapHint() {
  const t = useTranslations("map");
  const ready = useWorldStore((s) => s.firstViewReady);
  const picking = useWorldStore((s) => s.picking);
  const covered = useUiStore((s) => s.selectedPlaceId !== null || s.listOpen);
  // decided once, when the city is first drawn (client only: never during server rendering)
  const [phase, setPhase] = useState<"pending" | "on" | "leaving" | "off">("pending");
  if (phase === "pending" && ready) setPhase(seen() ? "off" : "on");

  useEffect(() => {
    if (phase !== "on") return;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }, [phase]);

  useEffect(() => {
    if (phase === "leaving") {
      const timer = setTimeout(() => setPhase("off"), LEAVE_MS);
      return () => clearTimeout(timer);
    }
    if (phase !== "on") return;
    const leave = () => setPhase("leaving");
    const timer = setTimeout(leave, SHOW_MS);
    const events = ["pointerdown", "wheel", "keydown"] as const;
    for (const e of events) window.addEventListener(e, leave, { once: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, leave);
    };
  }, [phase]);

  if (phase === "pending" || phase === "off" || picking || covered) return null;
  const touch = matchMedia("(pointer: coarse)").matches;
  return (
    <p
      aria-hidden="true"
      className={cn(
        // a pill on one line; a long translation wraps instead of overflowing
        "glass pointer-events-none flex min-h-9 max-w-full items-center gap-2 rounded-[18px] py-1.5 pr-4 pl-3 text-[13px] leading-snug font-medium text-balance text-foreground/80",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out",
        "transition-[opacity,translate] duration-200 ease-out",
        phase === "leaving" && "translate-y-1 opacity-0",
      )}
    >
      <HandGrabbingIcon className="size-4 shrink-0 text-muted-foreground" weight="bold" />
      {touch ? t("hintTouch") : t("hintPointer")}
    </p>
  );
}
