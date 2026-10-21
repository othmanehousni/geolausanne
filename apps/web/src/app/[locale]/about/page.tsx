import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage, Prose } from "@/components/layout/ContentPage";
import { alternatesFor, REPO_URL } from "@/lib/site";
import { REMOVAL_GRACE_DAYS, REMOVAL_MAX_SCORE, REMOVAL_MIN_DOWNVOTES } from "@/lib/data/rules";

const SWISSTOPO_TERMS = "https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices";

const SOURCES = [
  { id: "alti3d", name: "swissALTI3D", by: "swisstopo", url: "https://www.swisstopo.admin.ch/en/height-model-swissalti3d", licence: "ogd" },
  { id: "buildings", name: "swissBUILDINGS3D 3.0 Beta", by: "swisstopo", url: "https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta", licence: "ogd" },
  { id: "surface", name: "swissSURFACE3D Raster", by: "swisstopo", url: "https://www.swisstopo.admin.ch/en/height-model-swisssurface3d-raster", licence: "ogd" },
  { id: "swissimage", name: "SWISSIMAGE", by: "swisstopo", url: "https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10", licence: "ogd" },
  { id: "regio", name: "swissALTIRegio", by: "swisstopo", url: "https://www.swisstopo.admin.ch/en/height-model-swissaltiregio", licence: "ogd" },
  { id: "boundaries", name: "swissBOUNDARIES3D", by: "swisstopo", url: "https://www.swisstopo.admin.ch/en/landscape-model-swissboundaries3d", licence: "ogd" },
  { id: "osm", name: "OpenStreetMap", by: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright", licence: "odbl" },
  { id: "geoadmin", name: "GeoAdmin API (SearchServer, building register)", by: "swisstopo, FSO", url: "https://api3.geo.admin.ch/", licence: "ogd" },
] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("about");
  return { title: t("title"), description: t("metaDescription"), alternates: alternatesFor(locale, "/about") };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("about");
  return (
    <ContentPage title={t("title")} lead={t("intro")} path="/about">
      <Prose>
        <h2>{t("howTitle")}</h2>
        <ul>
          <li>{t("how1")}</li>
          <li>{t("how2", { down: REMOVAL_MIN_DOWNVOTES, score: REMOVAL_MAX_SCORE, days: REMOVAL_GRACE_DAYS })}</li>
          <li>{t("how3")}</li>
        </ul>

        <h2>{t("worldTitle")}</h2>
        <p>{t("world")}</p>

        <h2>{t("dataTitle")}</h2>
        <p>{t("sourcesIntro")}</p>
      </Prose>
      <div className="mt-4 overflow-x-auto rounded-[18px] border border-foreground/10">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("source")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("usedFor")}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t("licence")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {SOURCES.map((s) => (
              <tr key={s.id} className="align-top">
                <th scope="row" className="px-4 py-3 font-medium">
                  <a href={s.url} rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground">
                    {s.name}
                  </a>
                  <span className="block text-xs font-normal text-muted-foreground">© {s.by}</span>
                </th>
                <td className="px-4 py-3">{t(`sources.${s.id}`)}</td>
                <td className="px-4 py-3">
                  {s.licence === "ogd" ? (
                    <a href={SWISSTOPO_TERMS} rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground">
                      {t("ogd")}
                    </a>
                  ) : (
                    <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener noreferrer" className="underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground">
                      {t("odbl")}
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Prose>
        <h2>{t("communityTitle")}</h2>
        <p>{t("community")}</p>
        <p>{t("privacyNote")}</p>

        <h2>{t("codeTitle")}</h2>
        <p>
          {t("code")} <a href={REPO_URL}>{t("codeLink")}</a>
        </p>
      </Prose>
    </ContentPage>
  );
}
