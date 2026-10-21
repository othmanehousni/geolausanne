import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { BrandMarkSvg } from "@/components/brand/brand-mark-svg";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GeoLausanne";

// a deterministic voxel skyline along the bottom edge, one saffron spot on top
const COLS = Array.from({ length: 40 }, (_, i) => {
  const h = 2 + ((i * 37) % 11) + (i % 7 === 3 ? 6 : 0);
  return { h, roof: i % 5 === 1 ? "#c0644a" : i % 4 === 0 ? "#8f969c" : "#d9cfc2", wall: i % 3 === 0 ? "#e9e1d3" : "#d3c6b1" };
});
const SPOT = 17;

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #c7def0 0%, #f8f7f3 72%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26, padding: "64px 72px 0" }}>
          <BrandMarkSvg size={84} />
          <div style={{ fontSize: 74, fontWeight: 700, color: "#14171d", letterSpacing: -2.5 }}>GeoLausanne</div>
        </div>
        <div style={{ display: "flex", padding: "26px 72px 0", fontSize: 36, lineHeight: 1.3, color: "#454b57", maxWidth: 980 }}>{t("title")}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: "auto", padding: "0 24px", height: 250 }}>
          {COLS.map((c, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
              {i === SPOT ? <div style={{ width: 22, height: 22, marginBottom: 8, background: "#faab35", boxShadow: "inset -7px -7px 0 #d98a1f" }} /> : null}
              <div style={{ width: 24, height: 10, background: c.roof }} />
              <div style={{ width: 24, height: c.h * 14, background: c.wall }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", height: 40, background: "#4f8cc4" }} />
      </div>
    ),
    size,
  );
}
