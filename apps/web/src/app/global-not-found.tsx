import type { Metadata } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible_Next, Pixelify_Sans } from "next/font/google";
import { BrandMark } from "@/components/brand/BrandMark";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin", "latin-ext"], variable: "--font-atkinson", display: "swap" });
const pixel = Pixelify_Sans({ subsets: ["latin"], weight: ["600"], variable: "--font-pixel", display: "swap" });

export const metadata: Metadata = {
  title: "Page introuvable · Page not found — GeoLausanne",
};

/**
 * URLs that match no route at all (the proxy already sends unprefixed paths
 * to /fr or /en, so this is rare). The locale is unknown here, so the page
 * speaks both languages.
 */
export default function GlobalNotFound() {
  return (
    <html lang="fr" suppressHydrationWarning className={`${atkinson.variable} ${pixel.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
        <main className="flex max-w-md flex-col items-center gap-5 text-center">
          <BrandMark className="size-12" />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">Cette page n’est pas sur la carte</h1>
            <p lang="en" className="text-lg text-muted-foreground">
              This page is not on the map
            </p>
          </div>
          <nav aria-label="GeoLausanne" className="flex flex-wrap justify-center gap-2">
            <Link href="/fr" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Retour à la carte
            </Link>
            <Link href="/en" lang="en" className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
              Back to the map
            </Link>
          </nav>
        </main>
      </body>
    </html>
  );
}
