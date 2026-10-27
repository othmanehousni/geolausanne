"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { useWorldStore } from "@/stores/world-store";

/**
 * Says, visibly and to assistive technology (toasts are a live region), that
 * a place lies outside the 3D city loaded here, and why: only the demo city
 * that ships with the code, or beyond the 16 municipalities.
 */
export function useOutsideCityNotice() {
  const t = useTranslations("search");
  return useCallback(
    (name: string) => {
      const demo = useWorldStore.getState().manifest?.area === "flon";
      toast.add({ title: t("outside", { name }), description: demo ? t("outsideDemo") : t("outsideArea"), type: "info" });
    },
    [t],
  );
}
