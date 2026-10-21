"use client";

import {
  ArrowSquareOutIcon,
  ClockIcon,
  FlagIcon,
  GlobeSimpleIcon,
  LinkSimpleIcon,
  MapPinIcon,
  NavigationArrowIcon,
  PhoneIcon,
  CookingPotIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
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
    <div className="flex items-start gap-3 py-2.5">
      <dt className="flex shrink-0 items-center pt-0.5 text-muted-foreground [&_svg]:size-[18px]">
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 flex-1 text-sm leading-relaxed wrap-anywhere">{children}</dd>
    </div>
  );
}

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
        <div role="status" className="flex gap-3 rounded-2xl bg-downvote/10 p-3.5 text-sm">
          <WarningIcon className="mt-0.5 size-5 shrink-0 text-downvote" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("removedTitle")}</p>
            <p className="text-muted-foreground">{t("removedBody")}</p>
          </div>
        </div>
      ) : null}

      <HalalBadges place={place} />

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <VoteControl place={place} />
        <p className="pt-2 text-sm text-muted-foreground">
          {t("confirmations", { count: place.confirmations })}
          {place.last_confirmed_at
            ? ` · ${t("lastConfirmed", { date: format.dateTime(new Date(place.last_confirmed_at), { dateStyle: "medium" }) })}`
            : ""}
        </p>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground text-pretty">
        {t("trustNote")} {tVote("removalHint", { down: REMOVAL_MIN_DOWNVOTES, score: REMOVAL_MAX_SCORE })}
      </p>

      <div className="flex flex-wrap gap-2">
        <a href={directions} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "secondary" }), "h-10 rounded-full px-4")}>
          <NavigationArrowIcon weight="bold" aria-hidden="true" />
          {t("directions")}
          <span className="sr-only">{t("opensInNewTab")}</span>
        </a>
        <Button variant="secondary" className="h-10 rounded-full px-4" onClick={share}>
          <LinkSimpleIcon weight="bold" aria-hidden="true" />
          {t("share")}
        </Button>
        <Button variant="ghost" className="h-10 rounded-full px-3 text-muted-foreground" onClick={() => report({ placeId: place.id, name: place.name })}>
          <FlagIcon weight="bold" aria-hidden="true" />
          {t("report")}
        </Button>
      </div>

      <dl className="flex flex-col divide-y divide-border rounded-2xl bg-foreground/[0.035] px-4">
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
            <a href={website} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 font-medium underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground">
              {new URL(website).hostname.replace(/^www\./, "")}
              <ArrowSquareOutIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("opensInNewTab")}</span>
            </a>
          </InfoRow>
        ) : null}
        {place.phone ? (
          <InfoRow icon={<PhoneIcon aria-hidden="true" />} label={t("phone")}>
            <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`} className="font-medium underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground">
              {place.phone}
            </a>
          </InfoRow>
        ) : null}
        {place.cuisine.length > 0 ? (
          <InfoRow icon={<CookingPotIcon aria-hidden="true" />} label={t("cuisine")}>
            {place.cuisine.map((c) => c.replace(/_/g, " ")).join(", ")}
          </InfoRow>
        ) : null}
      </dl>

      {place.description ? <p className="text-sm leading-relaxed whitespace-pre-line text-pretty wrap-anywhere">{place.description}</p> : null}

      <Reviews place={place} onReport={report} />

      {isModerator ? <ModeratorTools place={place} /> : null}

      <p className="text-xs text-muted-foreground">
        {place.source === "osm" ? t("addedFromOsm") : place.creator_name ? t("addedBy", { name: place.creator_name }) : null}
        {" · "}
        <time dateTime={place.created_at}>{format.dateTime(new Date(place.created_at), { dateStyle: "medium" })}</time>
      </p>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
