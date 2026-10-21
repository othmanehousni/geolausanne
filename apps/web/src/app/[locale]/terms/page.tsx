import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage, Prose } from "@/components/layout/ContentPage";
import { alternatesFor } from "@/lib/site";
import { LEGAL_UPDATED, TermsContent } from "@/content/legal";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("legal");
  return { title: t("termsTitle"), description: t("termsDescription"), alternates: alternatesFor(locale, "/terms") };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const format = await getFormatter();
  return (
    <ContentPage
      title={t("termsTitle")}
      lead={t("updated", { date: format.dateTime(new Date(LEGAL_UPDATED), { dateStyle: "long" }) })}
      path="/terms"
    >
      <Prose>
        <TermsContent locale={locale} />
      </Prose>
    </ContentPage>
  );
}
