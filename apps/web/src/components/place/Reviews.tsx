"use client";

import { ChatCircleTextIcon, FlagIcon, PencilSimpleIcon, SealCheckIcon, UserIcon } from "@phosphor-icons/react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-context";
import { useReviews } from "@/lib/data/hooks";
import type { Place, Review } from "@/lib/data/types";
import { initials } from "@/lib/initials";
import { useUiStore } from "@/stores/ui-store";
import type { ReportTarget } from "./ReportDialog";
import { ReviewForm } from "./ReviewForm";
import { Stars } from "./StarRating";

function ReviewItem({ review, onReport }: { review: Review; onReport(): void }) {
  const t = useTranslations("reviews");
  const format = useFormatter();
  const name = review.is_mine ? t("yours") : (review.author_name ?? "—");
  const letters = review.author_name ? initials(review.author_name) : null;
  return (
    <li className="flex gap-3 py-4 first:pt-1">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.07] pt-px font-pixel text-[12px] text-foreground/80"
      >
        {letters ?? <UserIcon className="size-4" weight="bold" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{name}</span>
          <time dateTime={review.created_at} className="text-xs text-muted-foreground">
            {format.dateTime(new Date(review.created_at), { dateStyle: "medium" })}
          </time>
        </div>
        {review.rating !== null || review.halal_confirmed ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {review.rating !== null ? <Stars rating={review.rating} /> : null}
            {review.halal_confirmed ? (
              <p className="inline-flex items-center gap-1 text-xs font-medium">
                <SealCheckIcon weight="fill" className="size-3.5 text-leman" aria-hidden="true" />
                {t("confirmedBadge")}
                {review.confirmation_method ? <span className="font-normal text-muted-foreground">· {t(`methods.${review.confirmation_method}`)}</span> : null}
              </p>
            ) : null}
          </div>
        ) : null}
        {review.status === "hidden" ? <p className="text-sm text-muted-foreground italic">{t("hidden")}</p> : null}
        {review.body ? <p className="text-[14px] leading-relaxed whitespace-pre-line text-pretty wrap-anywhere">{review.body}</p> : null}
        {!review.is_mine ? (
          <Button variant="ghost" size="xs" className="-ml-2 w-fit rounded-full text-muted-foreground pointer-coarse:h-10" onClick={onReport}>
            <FlagIcon weight="bold" aria-hidden="true" />
            {t("report")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Reviews of a spot, newest first, with the signed-in member's own review editable in place. */
export function Reviews({ place, onReport }: { place: Place; onReport(target: ReportTarget): void }) {
  const t = useTranslations("reviews");
  const { user } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  const tCommon = useTranslations("common");
  const { data, isPending, isPaused, isError, refetch } = useReviews(place.id);
  const [editing, setEditing] = useState(false);
  const mine = data?.find((r) => r.is_mine) ?? null;

  return (
    <section aria-labelledby={`reviews-${place.id}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`reviews-${place.id}`} className="flex items-baseline gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          {t("title")}
          <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{t("count", { count: place.review_count })}</span>
        </h3>
        {!editing && place.status === "active" && !place.is_mine ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 pointer-coarse:h-10"
            onClick={() => (user ? setEditing(true) : openAuth("review", () => setEditing(true)))}
          >
            {mine ? <PencilSimpleIcon weight="bold" aria-hidden="true" /> : <ChatCircleTextIcon weight="bold" aria-hidden="true" />}
            {mine ? t("edit") : t("write")}
          </Button>
        ) : null}
      </div>
      {/* like votes, the server refuses reviews of your own spot */}
      {place.is_mine ? <p className="-mt-1 text-sm text-muted-foreground">{t("ownPlace")}</p> : null}
      {editing ? <ReviewForm placeId={place.id} existing={mine} onDone={() => setEditing(false)} /> : null}
      {/* offline (paused) and failed loads say so: an empty list would claim there are no reviews */}
      {isPaused && !data ? (
        <p className="text-sm text-muted-foreground">{tCommon("offline")}</p>
      ) : isError && !data ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-muted-foreground">{t("loadError")}</p>
          <Button variant="outline" size="sm" className="h-8 rounded-full px-3 pointer-coarse:h-10" onClick={() => void refetch()}>
            {tCommon("retry")}
          </Button>
        </div>
      ) : isPending ? (
        <div className="flex gap-3 pt-1" aria-hidden="true">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : data && data.length > 0 ? (
        <ul className="flex flex-col divide-y divide-foreground/[0.07]">
          {data.map((r) => (
            <ReviewItem key={r.id} review={r} onReport={() => onReport({ reviewId: r.id, name: place.name })} />
          ))}
        </ul>
      ) : !editing ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
    </section>
  );
}
