import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand/BrandMark";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-3" aria-hidden="true">
          <BrandMark className="size-14 motion-safe:animate-bob" />
          <span className="h-1.5 w-10 rounded-[50%] bg-foreground/10" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-pixel text-[13px] tracking-[0.14em] text-muted-foreground">404</p>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-balance">{t("title")}</h1>
          <p className="text-muted-foreground text-pretty">{t("body")}</p>
        </div>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-primary/88 active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring motion-reduce:active:scale-100"
        >
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
