import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { themeScript } from "@/lib/theme";
import { fontVariables } from "./fonts";
import "./globals.css";

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
    <html lang="fr" suppressHydrationWarning className={`${fontVariables} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
        <main className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center gap-3" aria-hidden="true">
            <BrandMark className="size-14 motion-safe:animate-bob" />
            <span className="h-1.5 w-10 rounded-[50%] bg-foreground/10" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-pixel text-[13px] tracking-[0.14em] text-muted-foreground">404</p>
            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-balance">Cette page n’est pas sur la carte</h1>
            <p lang="en" className="text-lg text-muted-foreground">
              This page is not on the map
            </p>
          </div>
          <nav aria-label="GeoLausanne" className="flex flex-wrap justify-center gap-2">
            <Link
              href="/fr"
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/88 focus-visible:ring-3 focus-visible:ring-ring"
            >
              Retour à la carte
            </Link>
            <Link
              href="/en"
              lang="en"
              className="inline-flex h-11 items-center rounded-full bg-foreground/[0.06] px-5 text-sm font-semibold outline-none hover:bg-foreground/[0.1] focus-visible:ring-3 focus-visible:ring-ring"
            >
              Back to the map
            </Link>
          </nav>
        </main>
      </body>
    </html>
  );
}
