# 0011. French first, English second, prefixed static URLs

Status: accepted · Date: 2026-10-21

## Context

Lausanne is French-speaking; a large share of the likely contributors are
students at EPFL and UNIL and visitors, many of whom read English more
easily. Pages should be indexable in both languages and served as static
HTML.

## Decision

* **next-intl 4**, locales `fr` (default) and `en`, `localePrefix: "always"`
  (`/fr/…`, `/en/…`).
* Un-prefixed URLs are redirected by the proxy using the locale cookie, then
  `Accept-Language`; prefixed pages never invoke the proxy (matcher), so they
  stay static and free to serve.
* Every page calls `setRequestLocale`; metadata includes canonical URLs,
  `hreflang` alternates and `x-default` = French.
* Translations in `messages/{fr,en}.json` with ICU plurals; a unit test keeps
  keys, placeholders and rich-text tags identical. Legal texts are written per
  language in JSX.
* The language switch in the account menu keeps the current page.

## Alternatives

* **No prefix for the default locale** (`/` = French): ambiguous caching and
  canonical URLs, and the root page could not be static.
* **German and Italian as well**: no audience for a Lausanne map today; the
  structure makes adding locales a matter of message files.
* **Automatic translation**: the halal vocabulary (certification,
  self-declared, confirmation methods) needs careful wording.

## Consequences

* Two message files to maintain in lockstep (tested).
* Community content (names, reviews) is shown as written.
