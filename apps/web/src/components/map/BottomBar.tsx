"use client";

import NumberFlow from "@number-flow/react";
import { PlusIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";
import { useStartAddSpot } from "./AddSpotFlow";

/**
 * The dock: one island with the two main actions, browse the spots in view
 * (the count rolls when the map moves; a dot blinks once when it changes)
 * and add a new one.
 */
export function BottomBar() {
  const t = useTranslations();
  const count = usePlacesStore((s) => s.places.length);
  const setListOpen = useUiStore((s) => s.setListOpen);
  const picking = useWorldStore((s) => s.picking);
  const reducedMotion = useWorldStore((s) => s.reducedMotion);
  const startAdd = useStartAddSpot();
  if (picking) return null;
  return (
    <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
      <Button
        variant="ghost"
        className="h-11 gap-2.5 rounded-full pr-4 pl-3.5 text-[14px] font-medium hover:bg-foreground/[0.05]"
        aria-haspopup="dialog"
        aria-label={t("map.spotCount", { count })}
        onClick={() => setListOpen(true)}
      >
        <span aria-hidden="true" className="relative grid size-2 place-items-center">
          {/* keyed by the count: the ping replays once per change (CSS, no loop) */}
          <span
            key={count}
            className="absolute inset-0 rounded-full bg-saffron opacity-0 motion-safe:animate-dot-ping"
          />
          <span className="size-2 rounded-full bg-saffron shadow-[0_0_0_2px_color-mix(in_oklch,var(--saffron),transparent_70%)]" />
        </span>
        <span aria-hidden="true" className="flex items-baseline gap-1.5">
          <NumberFlow value={count} animated={!reducedMotion} className="font-pixel text-[17px] leading-none tabular-nums" />
          <span className="max-sm:hidden">{t("map.inView", { count })}</span>
        </span>
      </Button>
      <Button variant="saffron" className="h-11 gap-1.5 rounded-full pr-5 pl-4 text-[14px]" aria-haspopup="dialog" onClick={startAdd}>
        <PlusIcon className="size-[18px]" weight="bold" aria-hidden="true" />
        <span className="sm:hidden">{t("submit.ctaShort")}</span>
        <span className="max-sm:hidden">{t("submit.cta")}</span>
      </Button>
    </div>
  );
}
