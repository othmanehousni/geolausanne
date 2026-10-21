import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage, Prose } from "@/components/layout/ContentPage";
import { alternatesFor } from "@/lib/site";
import { LEGAL_UPDATED, PrivacyContent } from "@/content/legal";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("legal");
  return { title: t("privacyTitle"), description: t("privacyDescription"), alternates: alternatesFor(locale, "/privacy") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const format = await getFormatter();
  return (
    <ContentPage
      title={t("privacyTitle")}
      lead={t("updated", { date: format.dateTime(new Date(LEGAL_UPDATED), { dateStyle: "long" }) })}
      path="/privacy"
    >
      <Prose>
        <PrivacyContent locale={locale} />
      </Prose>
    </ContentPage>
  );
}
