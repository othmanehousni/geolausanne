import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

const PAGES = ["", "/about", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PAGES.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      changeFrequency: path === "" ? ("daily" as const) : ("yearly" as const),
      priority: path === "" ? 1 : 0.4,
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`])) },
    })),
  );
}
