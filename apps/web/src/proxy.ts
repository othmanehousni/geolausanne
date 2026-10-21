import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Only un-prefixed URLs reach the proxy: it redirects them to /fr or /en
 * (cookie first, then Accept-Language). Locale-prefixed pages are static and
 * never pay for a proxy invocation.
 */
export default createMiddleware(routing);

export const config = {
  // skip locale-prefixed pages, Next internals, the bundled city tiles, the
  // generated apple-icon and every path with a file extension
  matcher: ["/", "/((?!(?:fr|en)(?:/|$)|api/|_next/|_vercel/|city/|apple-icon|.*\\..*).*)"],
};
