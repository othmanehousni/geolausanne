# Accounts and sign-in

Browsing, searching and reading reviews need no account. Adding a spot,
voting, reviewing and reporting do. Decision record:
[ADR 0010](../decisions/0010-passwordless-auth.md).

## Methods

| Method | When available | Notes |
| --- | --- | --- |
| **E-mail link** (magic link, Supabase `signInWithOtp`) | when `NEXT_PUBLIC_AUTH_PROVIDERS` is empty or lists `email` | creates the account on first use; needs a real SMTP provider in production ([deployment](../operations/deployment.md#e-mail-for-sign-in-links)): Supabase's own mailer only reaches the project's team, so a site without SMTP leaves `email` out and the dialog shows only the OAuth buttons |
| **Google**, **GitHub** (OAuth) | when listed in `NEXT_PUBLIC_AUTH_PROVIDERS` and enabled in Supabase | free; no e-mail sending involved; the launch setup is `google,github` |
| **Cloudflare Turnstile** | when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set and CAPTCHA protection is on in Supabase | invisible-by-default bot check on the e-mail form; tokens are single-use, so the widget is rendered afresh after every attempt (a failed attempt used to leave a spent token and make every retry fail) |
| Demo sign-in | demo mode only (no Supabase configured) | any e-mail signs in instantly; an address starting with `mod` gets the moderator role so the console can be tried |

No passwords: nothing to leak, reset or brute-force, and one less form to
make accessible.

## Flow

1. An action that needs an account (vote, add, review, report) opens the
   sign-in dialog with the reason ("Sign in to vote", …).
2. The dialog sends the link (or starts OAuth) with
   `redirectTo = <origin>/<locale>/auth/callback?next=<current path and query>`.
3. The callback page is static. After hydration it reads `next` and accepts
   it only if it is a same-site path, so the link cannot be abused as an open
   redirect. `safeNext` resolves the value the way the browser will (against
   a placeholder origin) and keeps it only if the origin is unchanged; a
   character check was not enough, because browsers strip tabs and newlines
   from URLs and turn `/%09/evil.example` into `//evil.example` (found in the
   second review). Anything else falls back to `/<locale>`.
4. Creating the Supabase client exchanges the PKCE code from the URL
   (`flowType: "pkce"`, `detectSessionInUrl`). As soon as a session exists the
   visitor is sent back to `next`; after 12 s without a session the page
   shows an error with a way to request a new link.
5. In demo mode (instant sign-in) the action that opened the dialog resumes
   by itself (`openAuth(reason, then)` stores the continuation).

Sessions are kept by supabase-js in the browser (local storage, automatic
refresh). There are no server-side sessions or auth cookies: every page is
prerendered as static HTML and all data access goes through the RPCs, where
`auth.uid()` comes from the request's JWT.

## Supabase settings that matter

* **Site URL** = the production origin; **redirect URLs** = `https://<domain>/**`
  plus preview origins if needed. The callback path is locale-prefixed and
  carries a query string, hence the `/**` glob (the local
  `supabase/config.toml` allows `http://localhost:3000/**` and
  `http://127.0.0.1:3000/**`).
* E-mail confirmations on, OTP expiry 1 h, one e-mail per address per 60 s.
* Auth rate limits (per IP): 30 sign-in/sign-up requests and 30 OTP
  verifications per 5 minutes; anonymous sign-ins off; manual linking off.
* CAPTCHA: provider Turnstile, secret in `SUPABASE_AUTH_CAPTCHA_SECRET` (local)
  or the dashboard (hosted).

## Profiles, roles and bans

* A profile is created by a database trigger for each new user, with a
  pseudonymous `display_name` (`member-xxxxxx`) unless the sign-up metadata
  carries one. It can be changed in the profile dialog (1–40 characters). The
  e-mail address is never shown to anyone.
* Roles: `user`, `moderator`, `admin`. Moderators handle reports, hide or
  restore content and suspend users; admins also grant roles
  (`admin_set_role`). The **first admin** is set once in the Supabase SQL
  editor ([moderation guide](../operations/moderation.md#making-someone-a-moderator)).
* A suspension (`banned_until`) blocks every write until the date; reading
  stays possible.

## Deleting an account

Deleting the auth user (Supabase dashboard → Authentication → Users, on
request, see [privacy](../operations/privacy.md#handling-requests)) cascades
to the profile, votes and the vote log, reviews, and the reports made about
those reviews; reports the person filed stay for the moderators with the
reporter set to null; places the person added stay, with `created_by` set to
null.
