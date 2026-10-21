import { cn } from "cn";

/**
 * The GeoLausanne mark: one voxel of lake-blue city with a saffron top, the
 * colour reserved for halal spots. Decorative: the wordmark carries the name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("size-6 shrink-0", className)}>
      <path d="M12 2.6 20.6 7.3 12 12 3.4 7.3Z" fill="var(--saffron)" />
      <path d="M3.4 7.3 12 12v9.4L3.4 16.7Z" fill="oklch(0.56 0.12 245)" />
      <path d="M20.6 7.3 12 12v9.4l8.6-4.7Z" fill="oklch(0.42 0.1 248)" />
      <path d="M12 2.6 20.6 7.3 12 12 3.4 7.3Z" fill="none" stroke="oklch(1 0 0 / 0.35)" strokeWidth="0.6" />
    </svg>
  );
}
