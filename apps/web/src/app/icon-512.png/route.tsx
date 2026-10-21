import { ImageResponse } from "next/og";
import { BrandMarkSvg } from "@/components/brand/brand-mark-svg";

/** 512 px maskable icon for the web app manifest (safe zone: inner 80 %). */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c2737" }}>
        <BrandMarkSvg size={300} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
