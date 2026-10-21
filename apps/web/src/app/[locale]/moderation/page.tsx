import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/ContentPage";
import { ModerationConsole } from "@/components/moderation/ModerationConsole";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("moderation");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function ModerationPage({ params }: PageProps<"/[locale]/moderation">) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("moderation");
  return (
    <ContentPage title={t("title")} lead={t("description")} path="/moderation" wide>
      <ModerationConsole />
    </ContentPage>
  );
}
