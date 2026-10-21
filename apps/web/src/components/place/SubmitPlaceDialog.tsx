"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
import { Form } from "@base-ui/react/form";
import { CaretDownIcon, MapPinIcon, MapPinPlusIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChoiceCards } from "@/components/form/ChoiceCards";
import { FormDescription, FormError, FormField, FormInput, FormLabel, FormTextarea } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useCoverMap } from "@/hooks/use-cover-map";
import { useCreatePlace, useNearby } from "@/lib/data/hooks";
import {
  BackendError,
  CERTIFICATIONS,
  HALAL_LEVELS,
  PLACE_CATEGORIES,
  type Certification,
  type HalalLevel,
  type PlaceCategory,
} from "@/lib/data/types";
import { FIELD_LIMITS } from "@/lib/data/rules";
import { useErrorMessage } from "@/lib/errors";
import { reverseGeocode } from "@/lib/geo/geocoder";
import { flyToPlace } from "@/lib/world/navigation";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";
import { CategoryIcon } from "./CategoryIcon";

type Alcohol = "unknown" | "no" | "yes";

interface Values {
  name?: string;
  cuisine?: string;
  address?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  description?: string;
  certifier?: string;
}

const nullable = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** "Lebanese, kebab ," → ["lebanese", "kebab"] */
function cuisineTags(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/** The URL as the browser understands it, so "https://example.ch/a b" is sent as ".../a%20b". */
function websiteUrl(v: string | undefined): string | null {
  const s = nullable(v);
  if (!s) return null;
  try {
    return new URL(s).href;
  } catch {
    return s;
  }
}

/**
 * "Add a halal spot". The location comes from the map (or the visitor's
 * position); the server re-checks every rule (service area, duplicates
 * within 40 m with a similar name, daily limit).
 */
export function SubmitPlaceDialog() {
  const t = useTranslations("submit");
  const tPlace = useTranslations("place");
  const tCommon = useTranslations("common");
  const open = useUiStore((s) => s.submitOpen);
  useCoverMap(open);
  const setOpen = useUiStore((s) => s.setSubmitOpen);
  const location = useUiStore((s) => s.submitLocation);
  const selectPlace = useUiStore((s) => s.selectPlace);
  const create = useCreatePlace();
  const errorMessage = useErrorMessage();

  const [category, setCategory] = useState<PlaceCategory>("restaurant");
  const [halal, setHalal] = useState<HalalLevel>("full");
  const [certification, setCertification] = useState<Certification>("community");
  const [alcohol, setAlcohol] = useState<Alcohol>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanel = useRef<HTMLDivElement>(null);

  // nothing is cut silently: too many or too long cuisines are a field error
  function cuisineError(v: string | undefined): string | null {
    const tags = cuisineTags(v);
    if (tags.length > FIELD_LIMITS.cuisineTags) return t("errors.cuisineCount", { max: FIELD_LIMITS.cuisineTags });
    if (tags.some((c) => c.length > FIELD_LIMITS.cuisineTag)) return t("errors.cuisineLength", { max: FIELD_LIMITS.cuisineTag });
    return null;
  }

  // An invalid field in the closed "More details" panel cannot take focus:
  // open the panel before the form looks for the first invalid field.
  function revealInvalidDetails() {
    const panel = morePanel.current;
    if (moreOpen || !panel) return;
    const fields = panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (Array.from(fields).some((el) => !el.validity.valid || (el.name === "cuisine" && cuisineError(el.value)))) {
      flushSync(() => setMoreOpen(true));
    }
  }

  const address = useQuery({
    queryKey: ["reverse-geocode", location?.easting, location?.northing],
    queryFn: ({ signal }) => reverseGeocode(location!.easting, location!.northing, signal),
    enabled: open && location !== null,
    staleTime: Infinity,
    retry: 0,
  });
  const nearby = useNearby(open && location ? { lon: location.lon, lat: location.lat } : null, 60);

  function reset() {
    setCategory("restaurant");
    setHalal("full");
    setCertification("community");
    setAlcohol("unknown");
    setError(null);
    setMoreOpen(false);
    setFormKey((k) => k + 1);
  }

  function close() {
    setOpen(false);
    useUiStore.getState().setSubmitLocation(null);
    reset();
  }

  function changeLocation() {
    setOpen(false);
    useWorldStore.getState().setPicking(true);
  }

  function openExisting(id: string) {
    close();
    selectPlace(id);
  }

  function submit(v: Values) {
    if (!location) return;
    setError(null);
    create.mutate(
      {
        name: (v.name ?? "").trim(),
        lon: location.lon,
        lat: location.lat,
        elevation: location.elevation,
        category,
        cuisine: cuisineTags(v.cuisine),
        address: nullable(v.address) ?? address.data ?? null,
        website: websiteUrl(v.website),
        phone: nullable(v.phone),
        opening_hours: nullable(v.openingHours),
        description: nullable(v.description),
        halal_level: halal,
        certification,
        certifier: certification === "certified" ? nullable(v.certifier) : null,
        serves_alcohol: alcohol === "unknown" ? null : alcohol === "yes",
      },
      {
        onSuccess: (place) => {
          toast.add({ title: t("success"), type: "success" });
          close();
          selectPlace(place.id);
          flyToPlace(place);
        },
        onError: (err) => {
          setError(errorMessage(err));
          if (err instanceof BackendError && err.code === "duplicate_place") void nearby.refetch();
        },
      },
    );
  }

  const nearbyPlaces = nearby.data ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/25 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <Dialog.Popup
            // short screens (landscape phone with the keyboard up): the whole dialog scrolls,
            // rather than a sliver of fields between a fixed header and footer
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden [@media(max-height:30rem)]:overflow-y-auto rounded-t-3xl bg-popover text-popover-foreground shadow-[var(--shadow-raised)] outline-none transition-[translate,scale,opacity] duration-300 ease-drawer data-ending-style:duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:translate-y-8 motion-safe:data-starting-style:translate-y-8 sm:max-h-[min(88dvh,52rem)] sm:max-w-xl sm:rounded-3xl sm:motion-safe:data-ending-style:translate-y-0 sm:motion-safe:data-ending-style:scale-[0.97] sm:motion-safe:data-starting-style:translate-y-0 sm:motion-safe:data-starting-style:scale-[0.97]"
          >
            <div className="relative flex shrink-0 items-start gap-3 px-6 pt-6 pb-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-saffron text-saffron-foreground">
                <MapPinPlusIcon className="size-5" weight="bold" aria-hidden="true" />
              </span>
              <div className="min-w-0 pr-10">
                <Dialog.Title className="text-lg font-semibold">{t("title")}</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">{t("description")}</Dialog.Description>
              </div>
              <Dialog.Close
                aria-label={tCommon("close")}
                className="absolute top-5 right-5 grid size-9 place-items-center rounded-full bg-foreground/[0.06] outline-none transition-[background-color,scale] duration-150 ease-out after:absolute after:-inset-1 hover:bg-foreground/[0.1] active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/80 motion-reduce:active:scale-100"
              >
                <XIcon className="size-4.5" weight="bold" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <Form
              key={formKey}
              className="flex min-h-0 flex-1 flex-col [@media(max-height:30rem)]:flex-none"
              onSubmitCapture={revealInvalidDetails}
              onFormSubmit={(v) => submit(v as Values)}
            >
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pb-6 [@media(max-height:30rem)]:flex-none [@media(max-height:30rem)]:overflow-visible">
                <section aria-label={t("location")} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] p-3">
                  <MapPinIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{t("location")}</p>
                    <p className="truncate text-muted-foreground">
                      {address.isLoading ? tCommon("loading") : (address.data ?? t("locationUnknown"))}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 pointer-coarse:h-10" onClick={changeLocation}>
                    {t("changeLocation")}
                  </Button>
                </section>

                {nearbyPlaces.length > 0 ? (
                  <section aria-labelledby="nearby-title" className="flex flex-col gap-2 rounded-2xl border border-saffron/50 bg-saffron/10 p-3.5">
                    <h3 id="nearby-title" className="flex items-center gap-2 text-sm font-semibold">
                      <WarningCircleIcon className="size-4.5" weight="bold" aria-hidden="true" />
                      {t("nearbyTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground">{t("nearbyBody")}</p>
                    <ul className="flex flex-col gap-1">
                      {nearbyPlaces.slice(0, 4).map((p) => (
                        <li key={p.id}>
                          <Button type="button" variant="ghost" className="h-auto w-full justify-start rounded-xl px-2 py-1.5 text-left" onClick={() => openExisting(p.id)}>
                            <CategoryIcon category={p.category} className="size-4" />
                            <span className="truncate">{t("openExisting", { name: p.name })}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <FormField name="name">
                  <FormLabel>{t("name")}</FormLabel>
                  <FormInput required minLength={2} maxLength={FIELD_LIMITS.name} placeholder={t("namePlaceholder")} autoComplete="off" />
                  <FormError match="valueMissing">{t("errors.name")}</FormError>
                  <FormError match="tooShort">{t("errors.name")}</FormError>
                </FormField>

                <ChoiceCards<PlaceCategory>
                  name="category"
                  legend={t("category")}
                  value={category}
                  onValueChange={setCategory}
                  columns={2}
                  choices={PLACE_CATEGORIES.map((c) => ({
                    value: c,
                    label: tPlace(`categories.${c}`),
                    icon: <CategoryIcon category={c} />,
                  }))}
                />

                <ChoiceCards<HalalLevel>
                  name="halal"
                  legend={t("halalLevel")}
                  value={halal}
                  onValueChange={setHalal}
                  columns={3}
                  choices={HALAL_LEVELS.map((h) => ({ value: h, label: t(`halalLevels.${h}`) }))}
                />

                <ChoiceCards<Certification>
                  name="certification"
                  legend={t("certification")}
                  value={certification}
                  onValueChange={setCertification}
                  columns={3}
                  choices={CERTIFICATIONS.map((c) => ({ value: c, label: t(`certifications.${c}`) }))}
                />

                {certification === "certified" ? (
                  <FormField name="certifier">
                    <FormLabel>{t("certifier")}</FormLabel>
                    <FormInput required maxLength={FIELD_LIMITS.certifier} placeholder={t("certifierPlaceholder")} />
                    <FormError match="valueMissing">{t("errors.certifier")}</FormError>
                    <FormDescription>{t("certifierHint")}</FormDescription>
                  </FormField>
                ) : null}

                <ChoiceCards<Alcohol>
                  name="alcohol"
                  legend={t("alcohol")}
                  value={alcohol}
                  onValueChange={setAlcohol}
                  columns={3}
                  choices={(["unknown", "no", "yes"] as const).map((a) => ({ value: a, label: t(`alcoholOptions.${a}`) }))}
                />

                <Collapsible.Root open={moreOpen} onOpenChange={setMoreOpen} className="flex flex-col">
                  <Collapsible.Trigger className="group flex h-11 items-center justify-between rounded-xl px-1 text-sm font-semibold outline-none hover:text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/80">
                    {t("more")}
                    <CaretDownIcon className="size-4 transition-transform duration-200 ease-out group-data-panel-open:rotate-180" aria-hidden="true" />
                  </Collapsible.Trigger>
                  <Collapsible.Panel
                    ref={morePanel}
                    keepMounted
                    className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden"
                  >
                    <div className="flex flex-col gap-4 pt-2">
                      <FormField name="cuisine" validate={(value) => cuisineError(typeof value === "string" ? value : "")}>
                        <FormLabel>{t("cuisine")}</FormLabel>
                        <FormInput maxLength={200} placeholder={t("cuisinePlaceholder")} />
                        <FormError />
                        <FormDescription>{t("cuisineHint")}</FormDescription>
                      </FormField>
                      <FormField name="address">
                        <FormLabel>{t("address")}</FormLabel>
                        <FormInput key={address.data ?? "none"} defaultValue={address.data ?? ""} maxLength={FIELD_LIMITS.address} autoComplete="street-address" />
                      </FormField>
                      <FormField name="website">
                        <FormLabel>{t("website")}</FormLabel>
                        <FormInput type="url" inputMode="url" pattern="https?://.+" maxLength={FIELD_LIMITS.website} placeholder="https://" autoComplete="url" />
                        <FormError match="typeMismatch">{t("errors.website")}</FormError>
                        <FormError match="patternMismatch">{t("errors.website")}</FormError>
                      </FormField>
                      <FormField name="phone">
                        <FormLabel>{t("phone")}</FormLabel>
                        <FormInput type="tel" inputMode="tel" maxLength={FIELD_LIMITS.phone} autoComplete="tel" placeholder="+41 21 …" />
                      </FormField>
                      <FormField name="openingHours">
                        <FormLabel>{t("openingHours")}</FormLabel>
                        <FormInput maxLength={FIELD_LIMITS.openingHours} placeholder="Mo-Sa 11:00-22:00" />
                        <FormDescription>{t("openingHoursHint")}</FormDescription>
                      </FormField>
                      <FormField name="description">
                        <FormLabel>{t("description_label")}</FormLabel>
                        <FormTextarea maxLength={FIELD_LIMITS.description} rows={3} placeholder={t("descriptionPlaceholder")} />
                      </FormField>
                    </div>
                  </Collapsible.Panel>
                </Collapsible.Root>
              </div>

              <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-foreground/[0.02] px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {error ? (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={close}>
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 rounded-xl bg-saffron px-5 font-semibold text-saffron-foreground hover:bg-saffron/90"
                    disabled={create.isPending || !location}
                  >
                    {create.isPending ? <Spinner /> : null}
                    {create.isPending ? t("submitting") : t("submitButton")}
                  </Button>
                </div>
              </div>
            </Form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
