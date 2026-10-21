"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { BackendError, type BackendErrorCode } from "@/lib/data/types";

/** Normalise anything thrown by the data layer to a known error code. */
export function errorCode(err: unknown): BackendErrorCode {
  if (err instanceof BackendError) return err.code;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) return "network";
  return "unknown";
}

/** Returns a function that turns an error into a translated, user-facing sentence. */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return useCallback((err: unknown) => t(errorCode(err)), [t]);
}
