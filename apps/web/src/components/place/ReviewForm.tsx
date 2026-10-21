"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { Form } from "@base-ui/react/form";
import { CheckIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ChoiceCards } from "@/components/form/ChoiceCards";
import { FormError, FormField, FormLabel, FormTextarea } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useDeleteReview, useUpsertReview } from "@/lib/data/hooks";
import { FIELD_LIMITS } from "@/lib/data/rules";
import { CONFIRMATION_METHODS, type ConfirmationMethod, type Review } from "@/lib/data/types";
import { useErrorMessage } from "@/lib/errors";
import { StarRatingInput } from "./StarRating";

/** Create or edit the signed-in member's review of a spot (one per member and spot). */
export function ReviewForm({ placeId, existing, onDone }: { placeId: string; existing: Review | null; onDone(): void }) {
  const t = useTranslations("reviews");
  const tCommon = useTranslations("common");
  const ratingLabel = useId();
  const upsert = useUpsertReview();
  const remove = useDeleteReview();
  const errorMessage = useErrorMessage();
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [confirmed, setConfirmed] = useState(existing?.halal_confirmed ?? false);
  const [method, setMethod] = useState<ConfirmationMethod | null>(existing?.confirmation_method ?? null);
  const [error, setError] = useState<string | null>(null);
  const [bodyChanged, setBodyChanged] = useState(false);
  // a draft worth keeping: Escape does not close the panel over it (see PlacePanel)
  const dirty =
    bodyChanged ||
    rating !== (existing?.rating ?? null) ||
    confirmed !== (existing?.halal_confirmed ?? false) ||
    method !== (existing?.confirmation_method ?? null);

  function submit(values: { body?: string }) {
    const body = (values.body ?? "").trim();
    if (rating === null && body === "" && !confirmed) {
      setError(t("needContent"));
      return;
    }
    if (confirmed && !method) {
      setError(t("methodRequired"));
      return;
    }
    setError(null);
    upsert.mutate(
      { placeId, rating, body, halalConfirmed: confirmed, confirmationMethod: confirmed ? method : null },
      {
        onSuccess: () => {
          toast.add({ title: t("posted"), type: "success" });
          onDone();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <Form className="flex flex-col gap-4 rounded-[2rem] bg-foreground/[0.035] p-4" data-review-draft={dirty || undefined} onFormSubmit={(v) => submit(v)}>
      <div className="flex flex-col gap-1">
        <span id={ratingLabel} className="text-sm font-medium">
          {t("rating")}
        </span>
        <StarRatingInput value={rating} onValueChange={setRating} labelledBy={ratingLabel} />
      </div>
      <FormField name="body">
        <FormLabel>{t("body")}</FormLabel>
        <FormTextarea
          defaultValue={existing?.body ?? ""}
          maxLength={FIELD_LIMITS.reviewBody}
          placeholder={t("bodyPlaceholder")}
          rows={3}
          onChange={(e) => setBodyChanged(e.currentTarget.value !== (existing?.body ?? ""))}
        />
        <FormError />
      </FormField>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox.Root
          checked={confirmed}
          onCheckedChange={setConfirmed}
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-foreground/55 outline-none transition-colors duration-150 data-checked:border-foreground data-checked:bg-foreground data-checked:text-background focus-visible:ring-3 focus-visible:ring-ring/80"
        >
          <Checkbox.Indicator>
            <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span className="leading-snug font-medium">{t("confirm")}</span>
      </label>
      {confirmed ? (
        <ChoiceCards<ConfirmationMethod>
          name="method"
          legend={t("method")}
          value={method}
          onValueChange={setMethod}
          columns={2}
          choices={CONFIRMATION_METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {existing?.status === "hidden" ? <p className="text-sm text-muted-foreground">{t("hiddenKeep")}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-10 rounded-xl px-4" disabled={upsert.isPending}>
          {existing ? t("update") : t("submit")}
        </Button>
        <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        {/* deleting and posting again would undo the moderators' decision */}
        {existing && existing.status !== "hidden" ? (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto h-10 rounded-xl"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(placeId, {
                onSuccess: () => {
                  toast.add({ title: t("deleted"), type: "success" });
                  onDone();
                },
                onError: (err) => setError(errorMessage(err)),
              })
            }
          >
            {t("delete")}
          </Button>
        ) : null}
      </div>
    </Form>
  );
}
