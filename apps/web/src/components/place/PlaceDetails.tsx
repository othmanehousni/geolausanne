"use client";

import {
  ArrowSquareOutIcon,
  ClockIcon,
  CookingPotIcon,
  FlagIcon,
  GlobeSimpleIcon,
  InfoIcon,
  LinkSimpleIcon,
  MapPinIcon,
  NavigationArrowIcon,
  PhoneIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";
import { REMOVAL_MAX_SCORE, REMOVAL_MIN_DOWNVOTES } from "@/lib/data/rules";
import type { Place } from "@/lib/data/types";
import { useUiStore } from "@/stores/ui-store";
import { HalalBadges } from "./HalalBadges";
import { ModeratorTools } from "./ModeratorTools";
import { ReportDialog, type ReportTarget } from "./ReportDialog";
import { Reviews } from "./Reviews";
import { VoteControl } from "./VoteControl";

function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <dt className="flex shrink-0 items-center pt-px text-muted-foreground [&_svg]:size-[18px]">
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-snug wrap-anywhere">{children}</dd>
    </div>
  );
}

/** The three quick actions are equal tiles, icon over label. */
const tile =
  "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[16px] px-2 py-2.5 text-center text-[12.5px] leading-tight font-medium outline-none select-none transition-[background-color,scale] duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover motion-reduce:active:scale-100 [&_svg]:size-5";

/** Everything about one spot: trust signals, vote, practical info, reviews. */
export function PlaceDetails({ place }: { place: Place }) {
  const t = useTranslations("place");
  const tVote = useTranslations("vote");
  const format = useFormatter();
  const locale = useLocale();
  const { user, isModerator } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const website = safeUrl(place.website);

  function report(target: ReportTarget) {
    if (user) setReportTarget(target);
    else openAuth("report", () => setReportTarget(target));
  }

  async function share() {
    const url = `${window.location.origin}/${locale}?spot=${place.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.add({ title: t("shareCopied"), type: "success" });
    } catch {
      // clipboard refused (permissions, insecure context): show the link to copy by hand
      toast.add({ title: t("shareFallback"), description: url, timeout: 0 });
    }
  }

  const directions = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${place.lat.toFixed(6)}%2C${place.lon.toFixed(6)}`;

  return (
    <div className="flex flex-col gap-5">
      {place.status !== "active" ? (
        <div role="status" className="flex gap-3 rounded-[18px] bg-downvote/10 p-3.5 text-sm">
          <WarningIcon className="mt-0.5 size-5 shrink-0 text-downvote" weight="fill" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("removedTitle")}</p>
            <p className="text-muted-foreground">{t("removedBody")}</p>
          </div>
        </div>
      ) : null}

      <HalalBadges place={place} />

      <div className="flex flex-col gap-2.5">
        <div className="rounded-[22px] bg-foreground/[0.045] p-1.5 pr-4">
          <VoteControl place={place}>
            <p className="text-[13.5px] leading-snug font-medium text-pretty">{t("confirmations", { count: place.confirmations })}</p>
            {place.last_confirmed_at ? (
              <p className="text-xs text-muted-foreground">
                {t("lastConfirmed", { date: format.dateTime(new Date(place.last_confirmed_at), { dateStyle: "medium" }) })}
              </p>
            ) : null}
          </VoteControl>
        </div>
        <p className="flex gap-2 px-1.5 text-xs leading-relaxed text-muted-foreground text-pretty">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" weight="bold" aria-hidden="true" />
          <span>
            {t("trustNote")} {tVote("removalHint", { down: REMOVAL_MIN_DOWNVOTES, score: REMOVAL_MAX_SCORE })}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <a href={directions} target="_blank" rel="noopener noreferrer" className={cn(tile, "bg-foreground text-background hover:bg-foreground/88")}>
          <NavigationArrowIcon weight="fill" aria-hidden="true" />
          {t("directions")}
          <span className="sr-only">{t("opensInNewTab")}</span>
        </a>
        <button type="button" className={cn(tile, "bg-foreground/[0.055] hover:bg-foreground/[0.09]")} onClick={share}>
          <LinkSimpleIcon weight="bold" aria-hidden="true" />
          {t("share")}
        </button>
        {/* the short visible label is the start of the full name (WCAG 2.5.3) */}
        <button
          type="button"
          aria-label={t("report")}
          className={cn(tile, "bg-foreground/[0.055] hover:bg-foreground/[0.09]")}
          onClick={() => report({ placeId: place.id, name: place.name })}
        >
          <FlagIcon weight="bold" aria-hidden="true" />
          {t("reportShort")}
        </button>
      </div>

      <dl className="flex flex-col divide-y divide-foreground/[0.07] rounded-[18px] bg-foreground/[0.035] px-3.5">
        {place.address ? (
          <InfoRow icon={<MapPinIcon aria-hidden="true" />} label={t("address")}>
            {place.address}
          </InfoRow>
        ) : null}
        {place.opening_hours ? (
          <InfoRow icon={<ClockIcon aria-hidden="true" />} label={t("openingHours")}>
            <span className="font-mono text-[13px]">{place.opening_hours}</span>
          </InfoRow>
        ) : null}
        {website ? (
          <InfoRow icon={<GlobeSimpleIcon aria-hidden="true" />} label={t("website")}>
            <a href={website} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 font-medium underline decoration-foreground/25 underline-offset-3 transition-[text-decoration-color] hover:decoration-foreground">
              {new URL(website).hostname.replace(/^www\./, "")}
              <ArrowSquareOutIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">{t("opensInNewTab")}</span>
            </a>
          </InfoRow>
        ) : null}
        {place.phone ? (
          <InfoRow icon={<PhoneIcon aria-hidden="true" />} label={t("phone")}>
            <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`} className="font-medium tabular-nums underline decoration-foreground/25 underline-offset-3 transition-[text-decoration-color] hover:decoration-foreground">
              {place.phone}
            </a>
          </InfoRow>
        ) : null}
        {place.cuisine.length > 0 ? (
          <InfoRow icon={<CookingPotIcon aria-hidden="true" />} label={t("cuisine")}>
            <span className="capitalize">{place.cuisine.map((c) => c.replace(/_/g, " ")).join(", ")}</span>
          </InfoRow>
        ) : null}
      </dl>

      {place.description ? <p className="px-0.5 text-[14px] leading-relaxed whitespace-pre-line text-pretty wrap-anywhere">{place.description}</p> : null}

      <Reviews place={place} onReport={report} />

      {isModerator ? <ModeratorTools place={place} /> : null}

      <p className="border-t border-foreground/[0.07] pt-4 text-xs text-muted-foreground">
        {place.source === "osm" ? t("addedFromOsm") : place.creator_name ? t("addedBy", { name: place.creator_name }) : null}
        {" · "}
        <time dateTime={place.created_at}>{format.dateTime(new Date(place.created_at), { dateStyle: "medium" })}</time>
      </p>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
