import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Pixelify_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers/Providers";
import { routing } from "@/i18n/routing";
import { alternatesFor, siteUrl } from "@/lib/site";
import { THEME_COLORS, themeScript } from "@/lib/theme";
import "../globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson",
  display: "swap",
  // next/font has no metrics for this family yet, so no size-adjusted fallback
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

// Only the wordmark uses the pixel face: a small nod to the voxel city.
const pixel = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-pixel",
  display: "swap",
});

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
    <html lang={locale} suppressHydrationWarning className={`${atkinson.variable} ${pixel.variable}`}>
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
