import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { getLocale, getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand/BrandMark";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { REPO_URL } from "@/lib/site";

/**
 * Shell for the text pages (about, privacy, terms, moderation): a quiet
 * header with the way back to the map, a readable measure and a footer with
 * the other pages and the language switch.
 */
export async function ContentPage({
  title,
  lead,
  children,
  path,
  wide = false,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  /** the page path without locale, for the language links */
  path: string;
  wide?: boolean;
}) {
  const t = await getTranslations("common");
  const tNotFound = await getTranslations("notFound");
  const locale = await getLocale();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-foreground/[0.07] bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70">
        <div className={`mx-auto flex h-14 items-center justify-between gap-4 px-5 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          <Link href="/" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark className="size-[22px]" />
            {/* below 360 px the mark alone leaves room for the way back */}
            <span className="font-brand text-[16px] leading-none tracking-[-0.01em] max-[22.5rem]:sr-only">{t("appName")}</span>
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3.5 text-sm font-medium whitespace-nowrap outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-foreground/[0.1] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100"
          >
            <ArrowLeftIcon className="size-4" weight="bold" aria-hidden="true" />
            {tNotFound("home")}
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 px-5 py-10 outline-none sm:py-14 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[2.6rem]">{title}</h1>
        {lead ? <div className="mt-4 text-lg leading-relaxed text-muted-foreground text-pretty">{lead}</div> : null}
        <div className="mt-8">{children}</div>
      </main>
      <footer className="border-t border-foreground/[0.07]">
        <div className={`mx-auto flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-6 text-sm text-muted-foreground ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          <nav aria-label={t("appName")} className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/about" className="hover:text-foreground">
              {t("about")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              {t("privacy")}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {t("terms")}
            </Link>
            <a href={REPO_URL} className="hover:text-foreground" rel="noopener noreferrer">
              {t("sourceCode")}
            </a>
          </nav>
          <nav aria-label={t("language")} className="ml-auto flex gap-3">
            {routing.locales.map((l) => (
              <Link
                key={l}
                href={path}
                locale={l}
                lang={l}
                aria-current={l === locale ? "true" : undefined}
                className="hover:text-foreground aria-[current]:font-semibold aria-[current]:text-foreground"
              >
                {t(`languages.${l}`)}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Typographic defaults for long-form text on the content pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose-page flex flex-col gap-4 text-[15.5px] leading-relaxed text-foreground/90 sm:text-base">{children}</div>
  );
}
