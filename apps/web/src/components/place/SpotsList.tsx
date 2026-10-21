"use client";

import { Drawer } from "@base-ui/react/drawer";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { ArrowFatDownIcon, ArrowFatUpIcon, MapPinPlusIcon, SealCheckIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useStartAddSpot } from "@/components/map/AddSpotFlow";
import { Button } from "@/components/ui/button";
import { useCoverMap } from "@/hooks/use-cover-map";
import { useIsDesktop } from "@/hooks/use-media-query";
import type { Place } from "@/lib/data/types";
import { flyToPlace } from "@/lib/world/navigation";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { CategoryIcon } from "./CategoryIcon";

type Filter = "all" | "certified" | "full";

function rank(a: Place, b: Place) {
  return b.score - a.score || b.confirmations - a.confirmations || a.name.localeCompare(b.name);
}

function SpotRow({ place, onChoose }: { place: Place; onChoose(): void }) {
  const t = useTranslations("place");
  const tVote = useTranslations("vote");
  const setHovered = usePlacesStore((s) => s.setHovered);
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        onPointerEnter={() => setHovered(place.id)}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => setHovered(place.id)}
        onBlur={() => setHovered(null)}
        className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-foreground/[0.05] active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:active:scale-100"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-saffron/22">
          <CategoryIcon category={place.category} className="size-5" weight="duotone" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1 text-sm font-semibold">
            <span className="truncate">{place.name}</span>
            {place.certification_verified ? (
              <SealCheckIcon weight="fill" className="size-4 shrink-0 text-leman" aria-label={t("certification.verified")} />
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {[t(`categories.${place.category}`), t(`halal.${place.halal_level}`)].join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-1 text-xs font-semibold tabular-nums",
            place.score > 0 ? "[&_svg]:text-upvote" : place.score < 0 ? "[&_svg]:text-downvote" : "text-muted-foreground",
          )}
        >
          {place.score < 0 ? (
            <ArrowFatDownIcon weight="fill" className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowFatUpIcon weight={place.score > 0 ? "fill" : "regular"} className="size-3.5" aria-hidden="true" />
          )}
          <span className="sr-only">{tVote("score", { score: place.score })}</span>
          <span aria-hidden="true">{place.score}</span>
        </span>
      </button>
    </li>
  );
}

/** Text list of the spots around the map centre: the keyboard and screen-reader way to browse the map. */
export function SpotsList() {
  const t = useTranslations("spots");
  const tCommon = useTranslations("common");
  const tSubmit = useTranslations("submit");
  const open = useUiStore((s) => s.listOpen);
  const setOpen = useUiStore((s) => s.setListOpen);
  const selectPlace = useUiStore((s) => s.selectPlace);
  const places = usePlacesStore((s) => s.places);
  const startAdd = useStartAddSpot();
  const desktop = useIsDesktop();
  // modal (and covering the map) on phones only
  useCoverMap(open && desktop === false);
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const list = places.filter((p) =>
      filter === "certified" ? p.certification === "certified" : filter === "full" ? p.halal_level === "full" : true,
    );
    return list.sort(rank);
  }, [places, filter]);

  function choose(p: Place) {
    setOpen(false);
    selectPlace(p.id);
    flyToPlace(p);
  }

  if (desktop === null) return null;
  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      modal={desktop ? false : true}
      disablePointerDismissal={desktop}
      swipeDirection={desktop ? "left" : "down"}
    >
      <Drawer.Portal>
        {!desktop ? (
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/25 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        ) : null}
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-40">
          <Drawer.Popup
            className={cn(
              "pointer-events-auto fixed flex flex-col overflow-hidden bg-popover text-popover-foreground outline-none",
              desktop
                ? "top-[4.75rem] bottom-4 left-4 w-[24rem] max-w-[calc(100vw-2rem)] rounded-3xl shadow-[var(--shadow-raised)] [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-starting-style:[transform:translateX(calc(-100%-1.5rem))] data-ending-style:[transform:translateX(calc(-100%-1.5rem))]"
                : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)]",
            )}
          >
            {!desktop ? (
              <div className="flex shrink-0 justify-center pt-2.5" aria-hidden="true">
                <span className="h-1.5 w-10 rounded-full bg-foreground/20" />
              </div>
            ) : null}
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              <div className="relative flex shrink-0 flex-col gap-3 px-5 pt-4 pb-3">
                <div className="pr-10">
                  <Drawer.Title className="text-lg font-semibold">{t("title")}</Drawer.Title>
                  <Drawer.Description className="text-sm text-muted-foreground">{t("description")}</Drawer.Description>
                </div>
                <Drawer.Close
                  aria-label={tCommon("close")}
                  className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-foreground/[0.06] outline-none transition-[background-color,scale] duration-150 hover:bg-foreground/[0.1] active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <XIcon className="size-4.5" weight="bold" aria-hidden="true" />
                </Drawer.Close>
                <ToggleGroup
                  aria-label={t("filters")}
                  value={[filter]}
                  onValueChange={(v) => setFilter((v[0] as Filter | undefined) ?? "all")}
                  className="flex w-fit gap-1 rounded-full bg-foreground/[0.05] p-1"
                >
                  {(["all", "certified", "full"] as const).map((f) => (
                    <Toggle
                      key={f}
                      value={f}
                      className="h-8 rounded-full px-3 text-[13px] font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-pressed:bg-popover data-pressed:text-foreground data-pressed:shadow-[var(--shadow-float)]"
                    >
                      {t(f === "all" ? "filterAll" : f === "certified" ? "filterCertified" : "filterFull")}
                    </Toggle>
                  ))}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                  {t("count", { count: shown.length })}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {shown.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {shown.map((p) => (
                      <SpotRow key={p.id} place={p} onChoose={() => choose(p)} />
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">{t("empty")}</p>
                    <Button className="h-10 rounded-full bg-saffron px-4 font-semibold text-saffron-foreground hover:bg-saffron/90" onClick={startAdd}>
                      <MapPinPlusIcon weight="bold" aria-hidden="true" />
                      {tSubmit("cta")}
                    </Button>
                  </div>
                )}
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
