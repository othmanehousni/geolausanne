import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { BrandMarkSvg } from "@/components/brand/brand-mark-svg";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GeoLausanne";

// a deterministic block skyline along the bottom edge
const COLS = Array.from({ length: 40 }, (_, i) => {
  const h = 2 + ((i * 37) % 11) + (i % 7 === 3 ? 6 : 0);
  return { h, roof: i % 5 === 1 ? "#c0644a" : i % 4 === 0 ? "#8f969c" : "#d9cfc2" };
});

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #bcd9ec 0%, #e8f1f6 70%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "64px 72px 0" }}>
          <BrandMarkSvg size={88} />
          <div style={{ fontSize: 76, fontWeight: 700, color: "#1d2a3a", letterSpacing: -2 }}>GeoLausanne</div>
        </div>
        <div style={{ display: "flex", padding: "28px 72px 0", fontSize: 38, lineHeight: 1.25, color: "#33465c", maxWidth: 1000 }}>{t("title")}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: "auto", padding: "0 24px", height: 230 }}>
          {COLS.map((c, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", width: 24 }}>
              <div style={{ height: 10, background: c.roof }} />
              <div style={{ height: c.h * 14, background: i % 3 === 0 ? "#e3d6bf" : "#cbb79a" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", height: 40, background: "#5a8fc0" }} />
      </div>
    ),
    size,
  );
}
