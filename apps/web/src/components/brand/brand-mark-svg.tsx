import { BRAND_HEX, BRAND_RUNS } from "./brand-pixels";

/** Brand mark for generated images (next/og supports plain SVG, not CSS variables). */
export function BrandMarkSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={(size * 15) / 16} viewBox="0 0 16 15" shapeRendering="crispEdges">
      {BRAND_RUNS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={BRAND_HEX[r.c]} />
      ))}
      <rect x={6} y={6} width={4} height={1} fill="#ffffff" fillOpacity={0.35} />
    </svg>
  );
}
