"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import NumberFlow from "@number-flow/react";
import { ArrowFatDownIcon, ArrowFatUpIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";
import { useVote } from "@/lib/data/hooks";
import type { Place, VoteValue } from "@/lib/data/types";
import { useErrorMessage } from "@/lib/errors";
import { announce } from "@/stores/announcer-store";
import { useUiStore } from "@/stores/ui-store";

type Choice = "up" | "down";
const toValue = (c: Choice | undefined): VoteValue => (c === "up" ? 1 : c === "down" ? -1 : 0);

/**
 * Up/down vote pill: a Base UI ToggleGroup (pressed state, arrow keys) with
 * the score in between, and what the votes add up to beside it (the caller
 * can put a headline above that line). The arrow pops on upvote and shakes
 * on downvote, the score rolls in the vote direction. Optimistic, with
 * rollback and an error toast on failure.
 */
export function VoteControl({ place, children }: { place: Place; children?: React.ReactNode }) {
  const t = useTranslations("vote");
  const locale = useLocale();
  const { user } = useAuth();
  const openAuth = useUiStore((s) => s.openAuth);
  const selectPlace = useUiStore((s) => s.selectPlace);
  const vote = useVote();
  const errorMessage = useErrorMessage();
  const [trend, setTrend] = useState<-1 | 0 | 1>(0);
  // bumps to replay the icon animation on every press
  const [pulse, setPulse] = useState<{ choice: Choice; n: number } | null>(null);

  const current: Choice[] = place.my_vote === 1 ? ["up"] : place.my_vote === -1 ? ["down"] : [];
  const disabled = place.is_mine || place.status !== "active";

  function cast(value: VoteValue) {
    const run = () => {
      setTrend(value === 0 ? (place.my_vote === 1 ? -1 : 1) : value);
      if (value !== 0) setPulse((p) => ({ choice: value === 1 ? "up" : "down", n: (p?.n ?? 0) + 1 }));
      vote.mutate(
        { place, value },
        {
          onSuccess: (fresh) => {
            announce(t("score", { score: fresh.score }));
            if (fresh.status === "removed") {
              toast.add({ title: t("removed"), type: "info" });
              selectPlace(null);
            }
          },
          onError: (err) => toast.add({ title: t("failed"), description: errorMessage(err), type: "error" }),
        },
      );
    };
    if (!user) openAuth("vote", run);
    else run();
  }

  const button = cn(
    "relative grid size-9 place-items-center rounded-full text-foreground/55 outline-none select-none touch-manipulation pointer-coarse:size-10",
    "after:absolute after:-inset-1 transition-[background-color,color,scale] duration-150 ease-out hover:bg-foreground/[0.07] hover:text-foreground",
    "active:scale-[0.94] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-40",
  );

  return (
    <div className="flex items-center gap-3.5">
      <ToggleGroup
        value={current}
        onValueChange={(next) => cast(toValue(next[0] as Choice | undefined))}
        aria-label={t("group", { name: place.name })}
        disabled={disabled}
        className="flex h-11 shrink-0 items-center rounded-full bg-card p-1 shadow-[var(--shadow-float)] pointer-coarse:h-12"
      >
        <Toggle
          value="up"
          aria-label={t("up")}
          // filled when pressed: the text colour is the page colour, light on the day green, dark on the night one
          className={cn(button, "data-pressed:bg-upvote data-pressed:text-background data-pressed:hover:bg-upvote")}
        >
          <ArrowFatUpIcon
            key={pulse?.choice === "up" ? pulse.n : "up"}
            weight={place.my_vote === 1 ? "fill" : "bold"}
            className={cn("size-[18px]", pulse?.choice === "up" && "animate-vote-pop")}
            aria-hidden="true"
          />
        </Toggle>
        <span className="min-w-[3.25ch] px-1.5 text-center font-pixel text-[19px] leading-none tabular-nums">
          <NumberFlow value={place.score} trend={trend} locales={locale} aria-hidden="true" />
          <span className="sr-only">{t("score", { score: place.score })}</span>
        </span>
        <Toggle
          value="down"
          aria-label={t("down")}
          className={cn(button, "data-pressed:bg-downvote data-pressed:text-background data-pressed:hover:bg-downvote")}
        >
          <ArrowFatDownIcon
            key={pulse?.choice === "down" ? pulse.n : "down"}
            weight={place.my_vote === -1 ? "fill" : "bold"}
            className={cn("size-[18px]", pulse?.choice === "down" && "animate-vote-shake")}
            aria-hidden="true"
          />
        </Toggle>
      </ToggleGroup>
      <div className="flex min-w-0 flex-col gap-0.5">
        {children}
        <p className="text-xs text-muted-foreground tabular-nums">
          {place.is_mine
            ? t("ownPlace")
            : `${t("upCount", { count: place.upvotes })} · ${t("downCount", { count: place.downvotes })}`}
        </p>
        {!user && !disabled ? <p className="sr-only">{t("signIn")}</p> : null}
      </div>
    </div>
  );
}
