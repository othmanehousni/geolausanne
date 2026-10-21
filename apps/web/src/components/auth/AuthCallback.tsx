"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getRepository } from "@/lib/data";
import type { AuthUser } from "@/lib/data/repository";
import { useUiStore } from "@/stores/ui-store";

/** Only same-site paths are accepted as a destination (no open redirects). */
export function safeNext(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

interface CallbackInfo {
  error: boolean;
  next: string;
}
const SERVER_INFO: CallbackInfo = { error: false, next: "/" };
let cached: CallbackInfo | null = null;

function readCallback(): CallbackInfo {
  if (cached) return cached;
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const locale = window.location.pathname.split("/")[1] || "fr";
  cached = {
    error: Boolean(params.get("error") || params.get("error_description") || hash.get("error")),
    next: safeNext(params.get("next"), `/${locale}`),
  };
  return cached;
}
const noSubscribe = () => () => {};

/**
 * Landing page of the e-mail link / OAuth redirect. Creating the Supabase
 * client exchanges the PKCE code from the URL; once a session exists the
 * visitor goes back to where they were.
 */
export function AuthCallback() {
  const t = useTranslations("auth");
  const router = useRouter();
  const openAuth = useUiStore((s) => s.openAuth);
  // read after hydration (the page itself is prerendered without a query)
  const initial = useSyncExternalStore(noSubscribe, readCallback, () => SERVER_INFO);
  const [timedOut, setTimedOut] = useState(false);
  const failed = initial.error || timedOut;

  useEffect(() => {
    if (initial === SERVER_INFO || initial.error) return;
    const repo = getRepository();
    let done = false;
    const finish = (user: AuthUser | null) => {
      if (!user || done) return;
      done = true;
      router.replace(initial.next);
    };
    repo.auth.getUser().then(finish, () => undefined);
    const off = repo.auth.onChange(finish);
    const timer = setTimeout(() => !done && setTimedOut(true), 12_000);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [initial, router]);

  return (
    <main id="main" className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        {failed ? (
          <>
            <WarningCircleIcon className="size-10 text-destructive" aria-hidden="true" />
            <p className="text-lg font-semibold">{t("callbackFailed")}</p>
            <Button className="h-10 rounded-full px-5" onClick={() => openAuth(null)}>
              {t("signIn")}
            </Button>
          </>
        ) : (
          <>
            <Spinner className="size-8" />
            <p className="text-lg font-medium">{t("callbackWorking")}</p>
          </>
        )}
      </div>
    </main>
  );
}
