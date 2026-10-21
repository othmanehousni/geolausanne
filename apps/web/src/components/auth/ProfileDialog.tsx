"use client";

import { Form } from "@base-ui/react/form";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormDescription, FormError, FormField, FormInput, FormLabel } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useCoverMap } from "@/hooks/use-cover-map";
import { useAuth } from "@/lib/auth/auth-context";
import { getRepository } from "@/lib/data";
import { useErrorMessage } from "@/lib/errors";

/** Change the public display name shown next to spots and reviews. */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange(v: boolean): void }) {
  useCoverMap(open);
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const { profile, refreshProfile } = useAuth();
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(values: { displayName?: string }) {
    setPending(true);
    setError(null);
    try {
      await getRepository().auth.updateDisplayName((values.displayName ?? "").trim());
      await refreshProfile();
      toast.add({ title: t("profileSaved"), type: "success" });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-3xl p-6 sm:max-w-md">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-lg">{t("displayName")}</DialogTitle>
        </DialogHeader>
        <Form className="flex flex-col gap-4" onFormSubmit={(v) => void save(v)}>
          <FormField name="displayName">
            <FormLabel>{t("displayName")}</FormLabel>
            <FormInput
              key={profile?.display_name}
              defaultValue={profile?.display_name ?? ""}
              required
              minLength={2}
              maxLength={40}
              autoComplete="nickname"
              className="h-11"
            />
            <FormError match="valueMissing">{t("displayNameInvalid")}</FormError>
            <FormError match="tooShort">{t("displayNameInvalid")}</FormError>
            <FormDescription>{t("displayNameHint")}</FormDescription>
          </FormField>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="-mx-6 -mb-6 rounded-b-3xl px-6">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" className="h-10 rounded-xl" disabled={pending}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
