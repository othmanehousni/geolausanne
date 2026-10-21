import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand/BrandMark";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <BrandMark className="size-12" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-balance">{t("title")}</h1>
          <p className="text-muted-foreground">{t("body")}</p>
        </div>
        <Link href="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/80">
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
