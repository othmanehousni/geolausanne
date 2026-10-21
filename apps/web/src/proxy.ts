import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Only un-prefixed URLs reach the proxy: it redirects them to /fr or /en
 * (cookie first, then Accept-Language). Locale-prefixed pages are static and
 * never pay for a proxy invocation.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/((?!fr|en|api|auth|_next|_vercel|city|.*\\..*).*)"],
};
