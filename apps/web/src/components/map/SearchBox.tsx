"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { MagnifyingGlassIcon, MapPinIcon, MapTrifoldIcon, ShieldCheckIcon, CityIcon, EnvelopeSimpleIcon, XIcon } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CategoryIcon } from "@/components/place/CategoryIcon";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchPlaces } from "@/lib/data/hooks";
import type { Place } from "@/lib/data/types";
import { searchLocations, type GeoResult, type GeoResultKind } from "@/lib/geo/geocoder";
import { flyToLv95, flyToPlace, insideCity } from "@/lib/world/navigation";
import { announce } from "@/stores/announcer-store";
import { useUiStore } from "@/stores/ui-store";

type SpotItem = { kind: "spot"; id: string; label: string; place: Place };
type GeoItem = { kind: "geo"; id: string; label: string; geo: GeoResult };
type SearchItem = SpotItem | GeoItem;
interface SearchGroup {
  value: string;
  items: SearchItem[];
}

const GEO_ICONS: Record<GeoResultKind, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  address: MapPinIcon,
  place: MapTrifoldIcon,
  municipality: CityIcon,
  postcode: EnvelopeSimpleIcon,
};

/** How close the camera gets for each kind of result (metres). */
const GEO_DISTANCE: Record<GeoResultKind, number> = { address: 260, place: 650, municipality: 2200, postcode: 1400 };

const noSubscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * One search field for both community spots (our database) and streets,
 * neighbourhoods and postcodes (swisstopo). Built on Base UI Autocomplete:
 * combobox semantics, arrow-key navigation, grouped results and a polite
 * status region.
 */
export function SearchBox({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const t = useTranslations("search");
  const tCommon = useTranslations("common");
  const tCat = useTranslations("place.categories");
  const locale = useLocale();
  const selectPlace = useUiStore((s) => s.selectPlace);
  const pill = useRef<HTMLDivElement>(null);
  // Phones: the field shares its row with the brand and account buttons, so
  // the results take the screen's width (12 px from each edge) under it.
  // A virtual anchor places them there exactly; letting them overflow and be
  // shifted back made mobile browsers widen the page for a moment.
  const phone = useMediaQuery("(width < 40rem)");
  const screenWide = useMemo(
    () => ({
      getBoundingClientRect() {
        const r = pill.current?.getBoundingClientRect();
        return new DOMRect(12, r?.y ?? 0, document.documentElement.clientWidth - 24, r?.height ?? 0);
      },
      get contextElement() {
        return pill.current ?? undefined;
      },
    }),
    [],
  );
  const apple = useSyncExternalStore(noSubscribe, isApple, () => false);
  const [value, setValue] = useState("");
  // what the user typed (the input also shows chosen labels, which we don't search for)
  const [term, setTerm] = useState("");
  const query = useDebounced(term.trim(), 200);
  const active = query.length >= 2;

  const spots = useSearchPlaces(query);
  const geo = useQuery({
    queryKey: ["geocode", locale, query],
    queryFn: ({ signal }) => searchLocations(query, locale, signal),
    enabled: active,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: 0,
  });

  const spotItems: SearchItem[] = active
    ? (spots.data ?? []).slice(0, 5).map((p) => ({ kind: "spot", id: `spot:${p.id}`, label: p.name, place: p }))
    : [];
  const geoItems: SearchItem[] = active
    ? (geo.data ?? []).slice(0, 6).map((g) => ({ kind: "geo", id: g.id, label: g.name, geo: g }))
    : [];
  const groups: SearchGroup[] = [];
  if (spotItems.length) groups.push({ value: t("spots"), items: spotItems });
  if (geoItems.length) groups.push({ value: t("places"), items: geoItems });
  const total = spotItems.length + geoItems.length;
  const loading = active && (spots.isFetching || geo.isFetching);

  let status: React.ReactNode = null;
  const typed = term.trim();
  if (typed.length === 1) status = t("hint");
  else if (active && total === 0 && loading)
    status = (
      <>
        <Spinner className="size-3.5" aria-hidden="true" />
        {t("searching")}
      </>
    );
  // offline, backend requests wait (paused): never claim "nothing found" for a search that did not run
  else if (active && total === 0 && (spots.isPaused || geo.isPaused)) status = tCommon("offline");
  else if (active && total === 0 && spots.isError) status = t("spotsError");
  else if (active && total === 0) status = geo.isError ? t("geocoderError") : t("empty", { query });

  function choose(item: SearchItem) {
    if (item.kind === "spot") {
      selectPlace(item.place.id);
      flyToPlace(item.place);
      return;
    }
    const g = item.geo;
    flyToLv95(g.easting, g.northing, { distance: GEO_DISTANCE[g.kind] });
    announce(insideCity(g.easting, g.northing) ? t("showing", { name: g.name }) : t("outside", { name: g.name }));
  }

  return (
    <Autocomplete.Root
      items={groups}
      value={value}
      onValueChange={(next, details) => {
        setValue(next);
        if (details.reason !== "item-press") setTerm(next);
      }}
      itemToStringValue={(item: SearchItem) => item.label}
      filter={null}
      autoHighlight
    >
      <div
        ref={pill}
        className="glass flex h-11 w-full min-w-0 items-center gap-2.5 rounded-full pr-1.5 pl-4 transition-[box-shadow] duration-150 ease-out has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring"
      >
        <MagnifyingGlassIcon className="size-[17px] shrink-0 text-muted-foreground" weight="bold" aria-hidden="true" />
        <Autocomplete.Input
          ref={inputRef}
          aria-label={t("label")}
          aria-keyshortcuts="Control+K Meta+K"
          placeholder={t("placeholder")}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ellipsis text-foreground outline-none placeholder:text-muted-foreground md:text-[14.5px]"
        />
        {value === "" ? (
          <Kbd aria-hidden="true" className="mr-1.5 hidden md:inline-flex">
            {apple ? "⌘K" : "Ctrl K"}
          </Kbd>
        ) : null}
        <Autocomplete.Clear
          aria-label={t("clear")}
          onClick={() => setTerm("")}
          className="relative grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out after:absolute after:-inset-1.5 hover:bg-foreground/[0.07] hover:text-foreground active:scale-[0.96] motion-reduce:active:scale-100"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </Autocomplete.Clear>
      </div>

      <Autocomplete.Portal hidden={!status && total === 0}>
        <Autocomplete.Positioner anchor={phone ? screenWide : pill} sideOffset={8} align="start" className="z-40 outline-none">
          <Autocomplete.Popup
            aria-busy={loading || undefined}
            className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-[22px] bg-popover text-popover-foreground shadow-[var(--shadow-raised)] transition-opacity duration-100 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0"
          >
            <div className="max-h-[min(var(--available-height),26rem)] scroll-py-1.5 overflow-y-auto overscroll-contain p-1.5">
              <Autocomplete.Status className="text-sm text-muted-foreground">
                {status ? <div className="flex min-w-0 items-center gap-2 px-2.5 py-2 wrap-anywhere">{status}</div> : null}
                {!status && total > 0 ? <span className="sr-only">{t("results", { count: total })}</span> : null}
              </Autocomplete.Status>
              <Autocomplete.List>
                {(group: SearchGroup) => (
                  <Autocomplete.Group key={group.value} items={group.items} className="not-last:mb-1">
                    <Autocomplete.GroupLabel className="px-2.5 pt-2.5 pb-1 font-pixel text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
                      {group.value}
                    </Autocomplete.GroupLabel>
                    <Autocomplete.Collection>
                      {(item: SearchItem) => (
                        <Autocomplete.Item
                          key={item.id}
                          value={item}
                          onClick={() => choose(item)}
                          className="flex cursor-default items-center gap-3 rounded-[16px] px-2 py-1.5 outline-none select-none data-highlighted:bg-accent"
                        >
                          {item.kind === "spot" ? <SpotRow place={item.place} category={tCat(item.place.category)} /> : <GeoRow geo={item.geo} />}
                        </Autocomplete.Item>
                      )}
                    </Autocomplete.Collection>
                  </Autocomplete.Group>
                )}
              </Autocomplete.List>
              {total > 0 && geo.isError ? <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{t("geocoderError")}</p> : null}
            </div>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

function SpotRow({ place, category }: { place: Place; category: string }) {
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-saffron/20 text-[color-mix(in_oklch,var(--saffron-foreground),var(--saffron)_25%)] dark:text-saffron">
        <CategoryIcon category={place.category} className="size-[18px]" weight="duotone" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 truncate text-sm font-semibold">
          <span className="truncate">{place.name}</span>
          {place.certification_verified ? <ShieldCheckIcon weight="fill" className="size-4 shrink-0 text-leman" aria-hidden="true" /> : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">{[category, place.address].filter(Boolean).join(" · ")}</span>
      </span>
    </>
  );
}

function GeoRow({ geo }: { geo: GeoResult }) {
  const Icon = GEO_ICONS[geo.kind];
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-foreground/[0.05] text-muted-foreground">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{geo.name}</span>
        {geo.detail ? <span className="truncate text-xs text-muted-foreground">{geo.detail}</span> : null}
      </span>
    </>
  );
}
