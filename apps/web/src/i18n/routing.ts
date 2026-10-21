import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Lausanne is French-speaking; English serves EPFL/UNIL students and visitors.
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
