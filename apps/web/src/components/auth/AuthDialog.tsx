"use client";

import { Form } from "@base-ui/react/form";
import { EnvelopeSimpleIcon, GithubLogoIcon, GoogleLogoIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { FormDescription, FormError, FormField, FormInput, FormLabel } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useCoverMap } from "@/hooks/use-cover-map";
import { useAuth } from "@/lib/auth/auth-context";
import type { OAuthProvider } from "@/lib/data/repository";
import { useErrorMessage } from "@/lib/errors";
import { useUiStore } from "@/stores/ui-store";
import { TURNSTILE_SITE_KEY, Turnstile } from "./Turnstile";

const PROVIDER_META: Record<OAuthProvider, { name: string; Icon: typeof GoogleLogoIcon }> = {
  google: { name: "Google", Icon: GoogleLogoIcon },
  github: { name: "GitHub", Icon: GithubLogoIcon },
};

/** Where Supabase sends people back after the email link or OAuth consent. */
function callbackUrl(locale: string) {
  const next = `${window.location.pathname}${window.location.search}`;
  return `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Passwordless sign-in: a one-time email link (Supabase magic link with
 * PKCE), plus optional OAuth providers. In demo mode the address signs in
 * immediately and the interrupted action continues.
 */
export function AuthDialog() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const open = useUiStore((s) => s.authOpen);
  useCoverMap(open);
  const reason = useUiStore((s) => s.authReason);
  const closeAuth = useUiStore((s) => s.closeAuth);
  const { providers, demo, signInWithEmail, signInWithOAuth } = useAuth();
  const errorMessage = useErrorMessage();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // a double click submits twice before `pending` disables the button: one email, one sign-in
  const inFlight = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | undefined>();
  // Turnstile tokens are single-use: a fresh widget after every attempt
  const [captchaRound, setCaptchaRound] = useState(0);

  function onOpenChange(next: boolean) {
    if (!next) {
      closeAuth();
      setSentTo(null);
      setFormError(null);
    }
  }

  async function submit(values: { email?: string }) {
    const email = (values.email ?? "").trim();
    if (inFlight.current) return;
    if (TURNSTILE_SITE_KEY && !captcha) {
      setFormError(t("captchaRequired"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFormError(null);
    try {
      const { instant } = await signInWithEmail(email, callbackUrl(locale), captcha);
      if (instant) {
        const then = useUiStore.getState().authThen;
        toast.add({ title: t("demoSignedIn", { email }), type: "success" });
        onOpenChange(false);
        then?.();
      } else {
        setSentTo(email);
      }
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setPending(false);
      if (TURNSTILE_SITE_KEY) {
        setCaptcha(undefined);
        setCaptchaRound((n) => n + 1);
      }
    }
  }

  async function oauth(provider: OAuthProvider) {
    try {
      await signInWithOAuth(provider, callbackUrl(locale));
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-3xl p-6 sm:max-w-md">
        {sentTo ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
            <span className="grid size-14 place-items-center rounded-2xl bg-leman/12 text-leman">
              <PaperPlaneTiltIcon className="size-7" weight="duotone" aria-hidden="true" />
            </span>
            <DialogTitle className="text-lg">{t("checkEmail")}</DialogTitle>
            <DialogDescription className="text-pretty">{t("checkEmailBody", { email: sentTo })}</DialogDescription>
            <Button variant="ghost" className="mt-1" onClick={() => setSentTo(null)}>
              {t("useAnotherEmail")}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="gap-1.5 pr-6">
              <DialogTitle className="text-lg">{t("title")}</DialogTitle>
              <DialogDescription>{reason ? t(`reasons.${reason}`) : t("description")}</DialogDescription>
            </DialogHeader>

            {providers.length > 0 ? (
              <div className="flex flex-col gap-2">
                {providers.map((p) => {
                  const { name, Icon } = PROVIDER_META[p];
                  return (
                    <Button key={p} variant="outline" className="h-11 rounded-xl text-[15px]" onClick={() => oauth(p)}>
                      <Icon weight="bold" aria-hidden="true" />
                      {t("continueWith", { provider: name })}
                    </Button>
                  );
                })}
                <p className="relative my-1 text-center text-xs text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border">
                  <span className="relative bg-popover px-2">{t("or")}</span>
                </p>
              </div>
            ) : null}

            <Form className="flex flex-col gap-4" onFormSubmit={(v) => void submit(v)}>
              <FormField name="email">
                <FormLabel>{t("email")}</FormLabel>
                <FormInput
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="send"
                  placeholder={t("emailPlaceholder")}
                  className="h-11"
                />
                <FormError match="valueMissing">{t("invalidEmail")}</FormError>
                <FormError match="typeMismatch">{t("invalidEmail")}</FormError>
                {demo ? <FormDescription>{t("demoHint")}</FormDescription> : <FormDescription>{t("description")}</FormDescription>}
              </FormField>
              <Turnstile key={captchaRound} onToken={setCaptcha} />
              {formError ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" className="h-11 rounded-xl text-[15px]" disabled={pending}>
                {pending ? <Spinner /> : <EnvelopeSimpleIcon aria-hidden="true" />}
                {pending ? t("sending") : demo ? t("signIn") : t("sendLink")}
              </Button>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
