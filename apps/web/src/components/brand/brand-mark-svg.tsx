/** Brand mark for generated images (next/og supports plain SVG, not CSS variables). */
export function BrandMarkSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 2.6 20.6 7.3 12 12 3.4 7.3Z" fill="#f2a33a" />
      <path d="M3.4 7.3 12 12v9.4L3.4 16.7Z" fill="#3f7dbd" />
      <path d="M20.6 7.3 12 12v9.4l8.6-4.7Z" fill="#2b5687" />
    </svg>
  );
}
