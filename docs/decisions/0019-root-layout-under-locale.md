# 0019. Root layout under `[locale]`, global not-found

Status: accepted · Date: 2026-10-21

## Context

The usual next-intl setup has `app/layout.tsx` as the root layout and
`app/[locale]/layout.tsx` inside it. With Next.js 16, the root layout needs
the locale for `<html lang>` while staying static. `next/root-params` (the
static way to read route params in layouts) only exposes the params of the
**root** layout; the first production build failed with "Export locale
doesn't exist in next/root-params" because `[locale]` was not the root.

## Decision

* `app/[locale]/layout.tsx` **is the root layout** (renders `<html lang>` and
  `<body>`); there is no `app/layout.tsx`. `generateStaticParams` returns the
  two locales, so every page is prerendered per locale.
* `app/global-not-found.tsx` with `experimental.globalNotFound: true` renders
  a bilingual 404 for URLs outside the locale tree (it imports the global CSS
  and fonts itself).
* `app/[locale]/[...rest]/page.tsx` calls `notFound()`, so unknown paths
  inside a locale get the localized `app/[locale]/not-found.tsx`.
* The proxy only runs for un-prefixed URLs.

## Alternatives

* Reading the locale from headers or cookies in a top-level layout: makes
  every page dynamic (and breaks Cache Components' static shell).
* A fixed `<html lang="fr">` with client-side updates: wrong language for
  English pages and their search engine snippets.

## Consequences

* Two not-found pages (global and localized) to keep consistent.
* Anything that must wrap all pages (providers, fonts, skip link) lives in
  the `[locale]` layout.
