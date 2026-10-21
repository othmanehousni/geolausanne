"use client";

import { ChatCircleTextIcon, FlagIcon, PencilSimpleIcon, SealCheckIcon } from "@phosphor-icons/react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/auth-context";
import { useReviews } from "@/lib/data/hooks";
import type { Place, Review } from "@/lib/data/types";
import { useUiStore } from "@/stores/ui-store";
import type { ReportTarget } from "./ReportDialog";
import { ReviewForm } from "./ReviewForm";
import { Stars } from "./StarRating";

function ReviewItem({ review, onReport }: { review: Review; onReport(): void }) {
  const t = useTranslations("reviews");
  const format = useFormatter();
  return (
    <li className="flex flex-col gap-1.5 py-3.5 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold">{review.is_mine ? t("yours") : (review.author_name ?? "—")}</span>
        {review.rating !== null ? <Stars rating={review.rating} /> : null}
        <time dateTime={review.created_at} className="text-xs text-muted-foreground">
          {format.dateTime(new Date(review.created_at), { dateStyle: "medium" })}
        </time>
      </div>
      {review.halal_confirmed ? (
        <p className="inline-flex w-fit items-center gap-1 rounded-full bg-leman/10 px-2 py-0.5 text-xs font-medium">
          <SealCheckIcon weight="fill" className="size-3.5 text-leman" aria-hidden="true" />
          {t("confirmedBadge")}
          {review.confirmation_method ? <span className="text-muted-foreground">· {t(`methods.${review.confirmation_method}`)}</span> : null}
        </p>
      ) : null}
      {review.status === "hidden" ? <p className="text-sm text-muted-foreground italic">{t("hidden")}</p> : null}
      {review.body ? <p className="text-sm leading-relaxed whitespace-pre-line text-pretty">{review.body}</p> : null}
      {!review.is_mine ? (
        <Button variant="ghost" size="xs" className="-ml-2 w-fit text-muted-foreground" onClick={onReport}>
          <FlagIcon aria-hidden="true" />
          {t("report")}
        </Button>
      ) : null}
    </li>
  );
}

/** Reviews of a spot, newest first, with the signed-in member's own review editable in place. */
export function Reviews({ place, onReport }: { place: Place; onReport(target: ReportTarget): void }) {
  const t = useTranslations("reviews");
  const { user } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  const { data, isLoading } = useReviews(place.id);
  const [editing, setEditing] = useState(false);
  const mine = data?.find((r) => r.is_mine) ?? null;

  return (
    <section aria-labelledby={`reviews-${place.id}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`reviews-${place.id}`} className="text-base font-semibold">
          {t("title")} <span className="font-normal text-muted-foreground tabular-nums">· {t("count", { count: place.review_count })}</span>
        </h3>
        {!editing && place.status === "active" ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 rounded-full px-3"
            onClick={() => (user ? setEditing(true) : openAuth("review", () => setEditing(true)))}
          >
            {mine ? <PencilSimpleIcon aria-hidden="true" /> : <ChatCircleTextIcon aria-hidden="true" />}
            {mine ? t("edit") : t("write")}
          </Button>
        ) : null}
      </div>
      {editing ? <ReviewForm placeId={place.id} existing={mine} onDone={() => setEditing(false)} /> : null}
      {isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : data && data.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
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
