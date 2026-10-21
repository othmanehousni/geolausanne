# 0010. E-mail links and optional OAuth, no passwords

Status: accepted · Date: 2026-10-21

## Context

Contributors need accounts (one vote per person, rate limits, moderation,
bans). Most visitors will only browse. Sign-in must be free, accessible,
privacy-friendly and quick on a phone in the street.

## Decision

* **Supabase Auth with magic links** (e-mail one-time links, PKCE flow).
  Accounts are created on first sign-in.
* **Google and GitHub OAuth** are optional, enabled per deployment with
  `NEXT_PUBLIC_AUTH_PROVIDERS` (both are free and avoid e-mail delivery).
* **Cloudflare Turnstile** (free) is optional bot protection on the e-mail
  form, enforced by Supabase's CAPTCHA setting.
* Sign-in is asked for only at the moment it is needed, with the reason
  ("Sign in to vote"), and the callback returns to the page the person was on
  (same-site paths only).
* Public names are pseudonyms by default ([0016](0016-privacy-by-default.md)).

## Alternatives

* **Passwords**: storage, reset flows, credential stuffing, an extra form to
  make accessible; no benefit for a community map.
* **Anonymous voting** (no accounts, cookies or fingerprints): trivially
  abused; the removal rule would be meaningless.
* **Phone/SMS sign-in**: costs money per message and collects phone numbers.
* **Passkeys only**: excellent, but support and recovery are still uneven for
  a general audience; can be added later through Supabase.

## Consequences

* Production needs an SMTP provider: Supabase's built-in mailer only delivers
  to the project's own team members and is limited to 2 messages per hour.
  Free tiers (e.g. Resend, Brevo) are enough at launch
  ([deployment](../operations/deployment.md#e-mail-for-sign-in-links)).
* No server sessions: the session lives in the browser and every request
  carries a JWT, so all pages stay static.
* Demo mode replaces sign-in with an instant local sign-in.
