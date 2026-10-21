import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCallback } from "@/components/auth/AuthCallback";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signIn"), robots: { index: false, follow: false } };
}

export default async function AuthCallbackPage({ params }: PageProps<"/[locale]/auth/callback">) {
  setRequestLocale((await params).locale);
  return <AuthCallback />;
}
