import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers/Providers";
import { routing } from "@/i18n/routing";
import { alternatesFor, siteUrl } from "@/lib/site";
import { THEME_COLORS, themeScript } from "@/lib/theme";
import { fontVariables } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t("title"), template: `%s · GeoLausanne` },
    description: t("description"),
    applicationName: "GeoLausanne",
    alternates: alternatesFor(locale),
    openGraph: {
      type: "website",
      siteName: "GeoLausanne",
      title: t("title"),
      description: t("description"),
      locale: locale === "fr" ? "fr_CH" : "en_GB",
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  colorScheme: "light dark",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <html lang={locale} suppressHydrationWarning className={`${fontVariables} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only-focusable fixed top-3 left-3 z-[100] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
