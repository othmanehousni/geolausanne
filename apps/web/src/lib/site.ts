/** Public base URL of the deployment (used for metadata, sitemap, auth redirects). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const REPO_URL = "https://github.com/othmanehousni/geolausanne";

const LOCALES = ["fr", "en"] as const;

/** Canonical and hreflang alternates for a page path (without locale prefix). */
export function alternatesFor(locale: string, path = "") {
  return {
    canonical: `/${locale}${path}`,
    languages: { ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`])), "x-default": `/fr${path}` },
  };
}
