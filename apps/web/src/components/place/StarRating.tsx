"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { StarIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Read-only stars; the number is given as text for assistive technology. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const t = useTranslations("reviews");
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-rating", className)}>
      <span className="sr-only">{t("ratingValue", { rating: Math.round(rating * 10) / 10 })}</span>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon
          key={i}
          aria-hidden="true"
          weight={rounded >= i ? "fill" : rounded >= i - 0.5 ? "duotone" : "regular"}
          className={cn("size-3.5", rounded < i - 0.5 && "text-foreground/50")}
        />
      ))}
    </span>
  );
}

/**
 * 1–5 star input as a Base UI radio group (arrow keys change the rating,
 * each star is named "n out of 5"); pressing the chosen star again clears it.
 */
export function StarRatingInput({
  value,
  onValueChange,
  labelledBy,
}: {
  value: number | null;
  onValueChange(v: number | null): void;
  labelledBy: string;
}) {
  const t = useTranslations("reviews");
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value === null ? null : String(value)}
      onValueChange={(v) => onValueChange(v === null ? null : Number(v))}
      className="flex items-center gap-0.5"
      onPointerLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Radio.Root
          key={i}
          value={String(i)}
          aria-label={t("ratingValue", { rating: i })}
          onPointerEnter={() => setHover(i)}
          onClick={() => {
            if (value === i) onValueChange(null);
          }}
          className="relative grid size-10 place-items-center rounded-lg text-rating outline-none transition-[scale] duration-150 ease-out active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/80 motion-reduce:active:scale-100"
        >
          <StarIcon
            aria-hidden="true"
            weight={shown >= i ? "fill" : "regular"}
            className={cn("size-7 transition-colors duration-100", shown < i && "text-foreground/50")}
          />
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
