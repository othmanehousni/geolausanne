import { setRequestLocale } from "next-intl/server";
import { MapExperience } from "@/components/map/MapExperience";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MapExperience />;
}
