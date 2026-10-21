"use client";

import { ListBulletsIcon, MapPinPlusIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";
import { useStartAddSpot } from "./AddSpotFlow";

/** The two main actions: browse the spots in view, add a new one. */
export function BottomBar() {
  const t = useTranslations();
  const count = usePlacesStore((s) => s.places.length);
  const setListOpen = useUiStore((s) => s.setListOpen);
  const picking = useWorldStore((s) => s.picking);
  const startAdd = useStartAddSpot();
  if (picking) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <Button
        variant="ghost"
        className="glass h-12 rounded-full px-4 text-[15px] font-medium hover:bg-transparent"
        aria-haspopup="dialog"
        onClick={() => setListOpen(true)}
      >
        <ListBulletsIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true" className="font-semibold tabular-nums sm:hidden">
          {count}
        </span>
        <span className="tabular-nums max-sm:sr-only">{t("map.spotCount", { count })}</span>
      </Button>
      <Button
        className="h-12 rounded-full bg-saffron px-5 text-[15px] font-semibold text-saffron-foreground shadow-[var(--shadow-float)] hover:bg-[color-mix(in_oklch,var(--saffron),black_6%)]"
        aria-haspopup="dialog"
        onClick={startAdd}
      >
        <MapPinPlusIcon className="size-5" weight="bold" aria-hidden="true" />
        <span className="sm:hidden">{t("submit.ctaShort")}</span>
        <span className="max-sm:hidden">{t("submit.cta")}</span>
      </Button>
    </div>
  );
}
