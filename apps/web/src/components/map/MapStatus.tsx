"use client";

import { ArrowClockwiseIcon, CubeIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { announce } from "@/stores/announcer-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

/**
 * Loading and failure states of the 3D city: a small pill while the first
 * view streams in (announced once when ready), a notice when blocks keep
 * failing to load (they are retried on their own, or at once on request), a
 * card when the city or WebGL is unavailable. The spots list keeps working
 * in every case.
 */
export function MapStatus() {
  const t = useTranslations("map");
  const tSpots = useTranslations("spots");
  const tCommon = useTranslations("common");
  const firstViewReady = useWorldStore((s) => s.firstViewReady);
  const loading = useWorldStore((s) => s.stats.loading);
  const manifestError = useWorldStore((s) => s.manifestError);
  const renderError = useWorldStore((s) => s.renderError);
  const retryManifest = useWorldStore((s) => s.retryManifest);
  const retrying = useWorldStore((s) => s.manifestRetrying);
  const failed = useWorldStore((s) => s.stats.failed > 0);
  const retryTiles = useWorldStore((s) => s.retryTiles);
  const setListOpen = useUiStore((s) => s.setListOpen);
  const announced = useRef(false);
  const slowStreaming = useDelayedFlag(firstViewReady && loading > 0, 600);
  // blocks that keep failing (offline, server trouble); one failure that the
  // first quick retry fixes stays silent
  const failing = useDelayedFlag(failed, 3000);

  useEffect(() => {
    if (firstViewReady && !announced.current) {
      announced.current = true;
      announce(t("ready"));
    }
  }, [firstViewReady, t]);

  useEffect(() => {
    if (failing) announce(t("tilesFailed"));
  }, [failing, t]);

  // the error card goes away once the city loads after all; if it held focus
  // (its Try again button), focus would fall to the page: hand it to the map
  const broken = Boolean(renderError || manifestError);
  const wasBroken = useRef(false);
  useEffect(() => {
    if (broken) wasBroken.current = true;
    else if (wasBroken.current) {
      wasBroken.current = false;
      if (document.activeElement === document.body) document.getElementById("main")?.focus({ preventScroll: true });
    }
  }, [broken]);

  if (broken) {
    const title = renderError === "no-webgl" ? t("noWebgl") : t("errorTitle");
    return (
      // centred on the screen, not on the bottom stack this status lives in
      <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center p-6">
        <div
          role="alert"
          className="glass pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-3xl p-6 text-center"
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <WarningCircleIcon className="size-6" aria-hidden="true" />
          </span>
          <p className="font-semibold">{title}</p>
          {renderError !== "no-webgl" ? <p className="text-sm text-muted-foreground">{t("errorBody")}</p> : null}
          <div className="flex flex-wrap justify-center gap-2">
            {manifestError && !renderError ? (
              // stays focusable while the retry runs, so focus is not lost
              <Button onClick={retryManifest} disabled={retrying} focusableWhenDisabled>
                {retrying ? <Spinner /> : <ArrowClockwiseIcon aria-hidden="true" />}
                {tCommon("retry")}
              </Button>
            ) : null}
            {renderError === "crashed" ? (
              <Button onClick={() => location.reload()}>
                <ArrowClockwiseIcon aria-hidden="true" />
                {tCommon("retry")}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setListOpen(true)}>
              {tSpots("open")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (failing) {
    return (
      <div className="glass pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl py-1 pr-1 pl-3 text-sm font-medium text-foreground/80">
        <WarningCircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t("tilesFailed")}</span>
        <Button variant="ghost" onClick={retryTiles}>
          <ArrowClockwiseIcon aria-hidden="true" />
          {tCommon("retry")}
        </Button>
      </div>
    );
  }

  if (firstViewReady) {
    // background streaming while moving: a quiet, decorative hint only
    return slowStreaming ? (
      <div aria-hidden="true" className="glass pointer-events-none grid size-9 place-items-center rounded-full text-foreground/70">
        <Spinner className="size-4" />
      </div>
    ) : null;
  }
  return (
    <div className="glass pointer-events-none flex h-9 items-center gap-2 rounded-full pr-3.5 pl-3 text-sm font-medium text-foreground/80">
      <CubeIcon weight="duotone" className="size-4 animate-pulse text-saffron motion-reduce:animate-none" aria-hidden="true" />
      <span>{t("loadingCity")}</span>
      {loading > 0 ? <span className="text-muted-foreground tabular-nums">· {t("loadingTiles", { count: loading })}</span> : null}
    </div>
  );
}
