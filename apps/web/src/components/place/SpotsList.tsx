"use client";

import { Drawer } from "@base-ui/react/drawer";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { ArrowFatDownIcon, ArrowFatUpIcon, PlusIcon, ShieldCheckIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
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

function SpotRow({ place, index, onChoose }: { place: Place; index: number; onChoose(): void }) {
  const t = useTranslations("place");
  const tVote = useTranslations("vote");
  const format = useFormatter();
  const setHovered = usePlacesStore((s) => s.setHovered);
  return (
    <li
      // rows rise in one after the other when the list opens (capped, so a long list is not slow to settle)
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-200 motion-safe:ease-out"
      style={{ "--tw-animation-delay": `${Math.min(index, 10) * 22}ms` } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={onChoose}
        onPointerEnter={() => setHovered(place.id)}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => setHovered(place.id)}
        onBlur={() => setHovered(null)}
        className="flex w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-foreground/[0.045] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-saffron/20 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--saffron),transparent_55%)]">
          <CategoryIcon category={place.category} className="size-5" weight="duotone" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[14px] leading-tight font-semibold">
            <span className="truncate">{place.name}</span>
            {place.certification_verified ? (
              <ShieldCheckIcon weight="fill" className="size-4 shrink-0 text-leman" aria-label={t("certification.verified")} />
            ) : null}
          </span>
          <span className="truncate text-[12.5px] text-muted-foreground">
            {[t(`categories.${place.category}`), t(`halal.${place.halal_level}`)].join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-full px-2 tabular-nums",
            place.score > 0 ? "bg-upvote/10 [&_svg]:text-upvote" : place.score < 0 ? "bg-downvote/10 [&_svg]:text-downvote" : "bg-foreground/[0.05] text-muted-foreground",
          )}
        >
          {place.score < 0 ? (
            <ArrowFatDownIcon weight="fill" className="size-3" aria-hidden="true" />
          ) : (
            <ArrowFatUpIcon weight={place.score > 0 ? "fill" : "bold"} className="size-3" aria-hidden="true" />
          )}
          <span className="sr-only">{tVote("score", { score: place.score })}</span>
          <span aria-hidden="true" className="pt-px font-pixel text-[13px] leading-none">
            {format.number(place.score)}
          </span>
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
    // the row loses focus and pointer as the list closes: drop its name tag on the map
    usePlacesStore.getState().setHovered(null);
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
                ? "top-[4.75rem] bottom-4 left-[max(1rem,env(safe-area-inset-left))] w-[24.5rem] max-w-[calc(100vw-2rem)] rounded-[28px] shadow-[var(--shadow-raised)] [transform:translateX(var(--drawer-swipe-movement-x))] transition-[transform,opacity] duration-[420ms] ease-drawer data-swiping:duration-0 data-starting-style:[transform:translateX(calc(-100%-1.5rem))] data-ending-style:[transform:translateX(calc(-100%-1.5rem))] data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*360ms)]"
                : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px] [transform:translateY(var(--drawer-swipe-movement-y))] transition-[transform,opacity] duration-[450ms] ease-drawer data-swiping:duration-0 data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)]",
              // reduced motion: the panel fades in place instead of sliding
              "motion-reduce:transition-opacity motion-reduce:data-starting-style:[transform:none] motion-reduce:data-ending-style:[transform:none] motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
            )}
          >
            {!desktop ? (
              <div className="flex shrink-0 justify-center pt-2" aria-hidden="true">
                <span className="h-[5px] w-9 rounded-full bg-foreground/15" />
              </div>
            ) : null}
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              <div className="relative flex shrink-0 flex-col gap-3.5 px-5 pt-5 pb-3">
                <div className="flex flex-col gap-1 pr-10">
                  <Drawer.Title className="text-[19px] leading-[1.2] font-semibold tracking-[-0.015em]">{t("title")}</Drawer.Title>
                  <Drawer.Description className="text-[13px] text-muted-foreground text-pretty">{t("description")}</Drawer.Description>
                </div>
                <Drawer.Close
                  aria-label={tCommon("close")}
                  className="absolute top-5 right-5 grid size-8 place-items-center rounded-full bg-foreground/[0.06] text-foreground/70 outline-none transition-[background-color,color,scale] duration-150 ease-out after:absolute after:-inset-1.5 hover:bg-foreground/[0.1] hover:text-foreground active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100"
                >
                  <XIcon className="size-4" weight="bold" aria-hidden="true" />
                </Drawer.Close>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <ToggleGroup
                    aria-label={t("filters")}
                    value={[filter]}
                    onValueChange={(v) => setFilter((v[0] as Filter | undefined) ?? "all")}
                    className="flex w-fit gap-0.5 rounded-full bg-foreground/[0.055] p-[3px]"
                  >
                    {(["all", "certified", "full"] as const).map((f) => (
                      <Toggle
                        key={f}
                        value={f}
                        // forced colours: the transparent border shows, and the pressed filter is filled like a
                        // selected option (in system colours only, so it opts out of the text backplate)
                        className="h-8 rounded-full border border-transparent px-3 text-[13px] font-medium text-muted-foreground pointer-coarse:h-10 outline-none transition-[background-color,color,box-shadow] duration-150 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-[var(--shadow-float)] data-pressed:forced-colors:bg-[Highlight] data-pressed:forced-colors:text-[HighlightText] data-pressed:forced-colors:forced-color-adjust-none"
                      >
                        {t(f === "all" ? "filterAll" : f === "certified" ? "filterCertified" : "filterFull")}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                    {t("count", { count: shown.length })}
                  </p>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {shown.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {shown.map((p, i) => (
                      <SpotRow key={p.id} place={p} index={i} onChoose={() => choose(p)} />
                    ))}
                  </ul>
                ) : filter !== "all" && places.length > 0 ? (
                  // spots are in view, just none that pass the filter
                  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground text-balance">{t("emptyFiltered")}</p>
                    <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setFilter("all")}>
                      {t("showAll", { count: places.length })}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                    <BrandMark className="size-9 opacity-90" />
                    <p className="max-w-[16rem] text-sm text-muted-foreground text-balance">{t("empty")}</p>
                    <Button variant="saffron" className="h-10 gap-1.5 rounded-full pr-4.5 pl-3.5" onClick={startAdd}>
                      <PlusIcon className="size-[18px]" weight="bold" aria-hidden="true" />
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
