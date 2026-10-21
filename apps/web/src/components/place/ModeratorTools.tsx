"use client";

import { EyeSlashIcon, GavelIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { getRepository } from "@/lib/data";
import { useModAction } from "@/lib/data/mod-hooks";
import type { Place } from "@/lib/data/types";
import { useErrorMessage } from "@/lib/errors";
import { Link } from "@/i18n/navigation";
import { useUiStore } from "@/stores/ui-store";

/** Quick moderation actions on a spot; only rendered for moderators (the server checks again). */
export function ModeratorTools({ place }: { place: Place }) {
  const t = useTranslations("moderation");
  const action = useModAction();
  const errorMessage = useErrorMessage();
  const selectPlace = useUiStore((s) => s.selectPlace);
  const mod = getRepository().mod;
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    action.mutate(fn, {
      onSuccess: () => {
        toast.add({ title: t("done"), type: "success" });
        after?.();
      },
      onError: (err) => toast.add({ title: errorMessage(err), type: "error" }),
    });
  return (
    <section aria-labelledby={`mod-${place.id}`} className="flex flex-col gap-2 rounded-[18px] border border-dashed border-foreground/20 p-3.5">
      <h3 id={`mod-${place.id}`} className="flex items-center gap-1.5 text-sm font-semibold">
        <GavelIcon className="size-4" weight="bold" aria-hidden="true" />
        <Link href="/moderation" className="underline-offset-3 hover:underline">
          {t("title")}
        </Link>
      </h3>
      <div className="flex flex-wrap gap-2">
        {place.certification === "certified" ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={action.isPending}
            onClick={() => run(() => mod.verifyCertification(place.id, !place.certification_verified))}
          >
            {place.certification_verified ? t("unverify") : t("verify")}
          </Button>
        ) : null}
        {place.status === "active" ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={action.isPending}
            onClick={() => run(() => mod.setPlaceStatus(place.id, "hidden"), () => selectPlace(null))}
          >
            <EyeSlashIcon aria-hidden="true" />
            {t("hidePlace")}
          </Button>
        ) : (
          <Button size="sm" disabled={action.isPending} onClick={() => run(() => mod.setPlaceStatus(place.id, "active"))}>
            {t("restore")}
          </Button>
        )}
      </div>
    </section>
  );
}
