"use client";

import { Drawer } from "@base-ui/react/drawer";
import { ArrowClockwiseIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/hooks/use-media-query";
import { usePlace } from "@/lib/data/hooks";
import type { Place } from "@/lib/data/types";
import { announce } from "@/stores/announcer-store";
import { useUiStore } from "@/stores/ui-store";
import { CategoryIcon } from "./CategoryIcon";
import { PlaceDetails } from "./PlaceDetails";

const SNAP_POINTS = ["19rem", 1] as const;

/** What the panel can show for the selected id. */
type PanelState = { kind: "place"; place: Place } | { kind: "loading" | "offline" | "missing" } | { kind: "error"; retry(): void };

function Header({ state }: { state: PanelState }) {
  const t = useTranslations("place");
  const place = state.kind === "place" ? state.place : null;
  const title =
    state.kind === "place"
      ? state.place.name
      : state.kind === "missing"
        ? t("notFoundTitle")
        : state.kind === "error"
          ? t("loadErrorTitle")
          : t("loading");
  return (
    <div className="flex items-start gap-3 pr-12">
      {/* the category tile, or its placeholder while loading; nothing for a spot that is not there */}
      {place || state.kind === "loading" || state.kind === "offline" ? (
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-saffron/22 text-foreground">
          {place ? <CategoryIcon category={place.category} className="size-6" weight="duotone" /> : null}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        <Drawer.Title className="text-lg leading-tight font-semibold text-balance wrap-anywhere">{title}</Drawer.Title>
        {place ? (
          <Drawer.Description className="truncate text-sm text-muted-foreground">
            {[t(`categories.${place.category}`), place.address].filter(Boolean).join(" · ")}
          </Drawer.Description>
        ) : null}
      </div>
    </div>
  );
}

function Body({ state }: { state: PanelState }) {
  const t = useTranslations("place");
  const tCommon = useTranslations("common");
  switch (state.kind) {
    case "place":
      return <PlaceDetails place={state.place} />;
    case "loading":
      return (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-7 w-2/3 rounded-full" />
          <Skeleton className="h-11 w-40 rounded-full" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      );
    case "offline":
      return <p className="text-sm text-muted-foreground">{tCommon("offline")}</p>;
    case "error":
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{t("loadErrorBody")}</p>
          <Button variant="secondary" className="h-10 rounded-full px-4" onClick={state.retry}>
            <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
            {tCommon("retry")}
          </Button>
        </div>
      );
    case "missing":
      return <p className="text-sm text-muted-foreground">{t("notFound")}</p>;
  }
}

/**
 * Details of the selected spot in a non-modal Base UI Drawer: the map stays
 * interactive (pan to look around, pick another pin), Escape or the close
 * button dismiss it. Desktop: a floating side panel; phones: a bottom sheet
 * with a peek and a full snap point.
 */
export function PlacePanel() {
  const t = useTranslations("place");
  const tReviews = useTranslations("reviews");
  const selectedId = useUiStore((s) => s.selectedPlaceId);
  const selectPlace = useUiStore((s) => s.selectPlace);
  const desktop = useIsDesktop();
  const { data, isPending, isPaused, isError, refetch } = usePlace(selectedId);
  // keep the last place rendered while the panel animates out
  const [shown, setShown] = useState<Place | null>(null);
  if (data && data !== shown) setShown(data);
  // every newly selected spot opens at the peek height on phones
  const [snap, setSnap] = useState<Drawer.Root.SnapPoint | null>(SNAP_POINTS[0]);
  const [snapFor, setSnapFor] = useState(selectedId);
  if (selectedId !== snapFor) {
    setSnapFor(selectedId);
    if (selectedId) setSnap(SNAP_POINTS[0]);
  }

  const open = selectedId !== null;
  const place = selectedId ? (data ?? (shown?.id === selectedId ? shown : null)) : shown;
  const live: PanelState["kind"] = place ? "place" : isPending ? (isPaused ? "offline" : "loading") : isError ? "error" : "missing";
  // while the panel animates out (nothing selected any more), it keeps saying what it said
  const [lastKind, setLastKind] = useState(live);
  if (open && live !== lastKind) setLastKind(live);
  const kind = open ? live : lastKind;
  const state: PanelState =
    kind === "place" && place
      ? { kind, place }
      : kind === "error"
        ? { kind, retry: () => void refetch() }
        : { kind: kind === "place" ? "missing" : kind };

  function onOpenChange(next: boolean, details: Drawer.Root.ChangeEventDetails) {
    if (next) return;
    // Escape (or Android's back gesture, a "close watcher") while a review has
    // unsaved changes keeps the panel and the draft; the close button still closes
    const dismiss = details.reason === "escape-key" || details.reason === "close-watcher";
    if (dismiss && document.querySelector("form[data-review-draft]")) {
      details.cancel();
      // the browser refuses only one back gesture per interaction: a second one closes
      if (details.isCanceled) {
        announce(tReviews("draftKept"));
        return;
      }
    }
    selectPlace(null);
  }

  const close = (
    <Drawer.Close
      aria-label={t("close")}
      className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-foreground/[0.06] text-foreground/80 outline-none transition-[background-color,scale] duration-150 ease-out after:absolute after:-inset-1 hover:bg-foreground/[0.1] active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/80 motion-reduce:active:scale-100"
    >
      <XIcon className="size-4.5" weight="bold" aria-hidden="true" />
    </Drawer.Close>
  );

  // decide the layout before mounting: swapping drawer variants after
  // hydration loses the snap point
  if (desktop === null) return null;
  if (desktop) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={onOpenChange}
        modal={false}
        disablePointerDismissal
        swipeDirection="left"
      >
        <Drawer.Portal>
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-40">
            <Drawer.Popup
              className={cn(
                "pointer-events-auto fixed top-[4.75rem] bottom-4 left-[max(1rem,env(safe-area-inset-left))] flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl bg-popover text-popover-foreground shadow-[var(--shadow-raised)] outline-none",
                "[transform:translateX(var(--drawer-swipe-movement-x))] transition-[transform,opacity] duration-[420ms] ease-drawer data-swiping:duration-0",
                "data-starting-style:[transform:translateX(calc(-100%-1.5rem))] data-ending-style:[transform:translateX(calc(-100%-1.5rem))] data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*360ms)]",
                "motion-reduce:transition-opacity motion-reduce:data-starting-style:[transform:none] motion-reduce:data-ending-style:[transform:none] motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
              )}
            >
              <Drawer.Content className="flex min-h-0 flex-1 flex-col">
                <div className="relative shrink-0 p-5 pb-4">
                  <Header state={state} />
                  {close}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6" data-base-ui-swipe-ignore>
                  <Body state={state} />
                </div>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      disablePointerDismissal
      swipeDirection="down"
      snapPoints={[...SNAP_POINTS]}
      snapPoint={snap}
      onSnapPointChange={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-40">
          <Drawer.Popup
            className={cn(
              "pointer-events-auto fixed inset-x-0 bottom-0 flex h-[calc(100dvh-4.5rem)] flex-col rounded-t-3xl bg-popover text-popover-foreground shadow-[0_-8px_32px_-8px_oklch(0.24_0.03_245/0.3)] outline-none dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08),0_-8px_32px_-8px_oklch(0_0_0/0.5)]",
              "[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] transition-[transform,opacity] duration-[450ms] ease-drawer data-swiping:duration-0",
              "data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)]",
              // reduced motion: fade at the peek height instead of sliding up from the edge
              "motion-reduce:transition-opacity motion-reduce:data-starting-style:[transform:translateY(var(--drawer-snap-point-offset,0px))] motion-reduce:data-ending-style:[transform:translateY(var(--drawer-snap-point-offset,0px))] motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
              "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-popover",
            )}
          >
            <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-foreground/20" />
            </div>
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              <div className="relative shrink-0 px-5 pt-2 pb-4">
                <Header state={state} />
                {close}
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                // keyboard and screen-reader focus must never land on content
                // hidden below the peek height (WCAG 2.4.11): expand first.
                // Taps (no focus ring) leave the sheet where the user put it.
                onFocusCapture={(e) => {
                  if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) setSnap(SNAP_POINTS[SNAP_POINTS.length - 1]);
                }}
              >
                <Body state={state} />
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
