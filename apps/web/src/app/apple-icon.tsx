import { ImageResponse } from "next/og";
import { BrandMarkSvg } from "@/components/brand/brand-mark-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f7f3" }}>
        <BrandMarkSvg size={128} />
      </div>
    ),
    size,
  );
}
