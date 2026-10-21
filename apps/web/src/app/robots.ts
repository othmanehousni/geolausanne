import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/fr/moderation", "/en/moderation", "/fr/auth/", "/en/auth/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
