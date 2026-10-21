import { cn } from "cn";
import { BRAND_RUNS } from "./brand-pixels";

/**
 * The GeoLausanne mark: one voxel in pixel art with a saffron top, the
 * colour reserved for halal spots, and lake-blue sides. Decorative: the
 * wordmark carries the name.
 */
const FILL = {
  T: "var(--saffron)",
  L: "oklch(0.58 0.13 250)",
  R: "oklch(0.43 0.11 255)",
} as const;

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 15" aria-hidden="true" focusable="false" shapeRendering="crispEdges" className={cn("size-6 shrink-0", className)}>
      {BRAND_RUNS.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={FILL[r.c]} />
      ))}
      {/* a one-pixel highlight on the top's front edges catches the light */}
      <rect x={6} y={6} width={4} height={1} fill="oklch(1 0 0 / 0.35)" />
    </svg>
  );
}
