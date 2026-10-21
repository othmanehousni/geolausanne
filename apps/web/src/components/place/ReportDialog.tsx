"use client";

import { Form } from "@base-ui/react/form";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChoiceCards } from "@/components/form/ChoiceCards";
import { FormField, FormLabel, FormTextarea } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useCoverMap } from "@/hooks/use-cover-map";
import { useReport } from "@/lib/data/hooks";
import { REPORT_REASONS, type ReportReason } from "@/lib/data/types";
import { useErrorMessage } from "@/lib/errors";

export interface ReportTarget {
  placeId?: string;
  reviewId?: string;
  /** shown in the title, e.g. the spot's name */
  name: string;
}

/** Report a spot or a review to the moderators. */
export function ReportDialog({ target, onClose }: { target: ReportTarget | null; onClose(): void }) {
  useCoverMap(target !== null);
  const t = useTranslations("report");
  const tCommon = useTranslations("common");
  const report = useReport();
  const errorMessage = useErrorMessage();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reasons = target?.reviewId
    ? REPORT_REASONS.filter((r) => r === "spam" || r === "offensive" || r === "other")
    : REPORT_REASONS;

  function submit(values: { details?: string }) {
    if (!target) return;
    if (!reason) {
      setError(t("reasonRequired"));
      return;
    }
    setError(null);
    report.mutate(
      { reason, placeId: target.placeId, reviewId: target.reviewId, details: (values.details ?? "").trim() || undefined },
      {
        onSuccess: () => {
          toast.add({ title: t("sent"), type: "success" });
          setReason(null);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-3xl p-6 sm:max-w-md">
        <DialogHeader className="gap-1.5 pr-6">
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
          <DialogDescription>
            {target?.name ? `${target.name} · ` : ""}
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <Form className="flex flex-col gap-4" onFormSubmit={(v) => submit(v)}>
          <ChoiceCards<ReportReason>
            name="reason"
            legend={t("reason")}
            value={reason}
            onValueChange={setReason}
            choices={reasons.map((r) => ({ value: r, label: t(`reasons.${r}`) }))}
            columns={2}
          />
          <FormField name="details">
            <FormLabel>{t("details")}</FormLabel>
            <FormTextarea maxLength={1000} rows={3} />
          </FormField>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" className="h-10 rounded-xl" disabled={report.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
