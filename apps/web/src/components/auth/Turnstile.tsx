"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile (free, no card) protecting the sign-in email form.
 * Only rendered when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; the matching
 * secret goes into Supabase Auth (Attack Protection → CAPTCHA).
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({ onToken }: { onToken(token: string | undefined): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let id: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: locale,
          theme: "auto",
          size: "flexible",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(undefined),
          "error-callback": () => callback.current(undefined),
        });
      })
      .catch(() => callback.current(undefined));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [locale]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="min-h-[65px]" />;
}
