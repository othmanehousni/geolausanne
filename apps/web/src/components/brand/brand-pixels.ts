/**
 * The GeoLausanne mark as pixel art: one voxel drawn on a 16 × 15 grid (a
 * 2:1 isometric cube) with a top (T), a lit left side (L) and a shaded right
 * side (R). Shared by the UI mark and the generated icons and images.
 */
export const BRAND_ROWS = [
  "......TTTT......",
  "....TTTTTTTT....",
  "..TTTTTTTTTTTT..",
  "TTTTTTTTTTTTTTTT",
  "LLTTTTTTTTTTTTRR",
  "LLLLTTTTTTTTRRRR",
  "LLLLLLTTTTRRRRRR",
  "LLLLLLLLRRRRRRRR",
  "LLLLLLLLRRRRRRRR",
  "LLLLLLLLRRRRRRRR",
  "LLLLLLLLRRRRRRRR",
  "LLLLLLLLRRRRRRRR",
  "..LLLLLLRRRRRR..",
  "....LLLLRRRR....",
  "......LLRR......",
] as const;

/** sRGB versions of the faces, for images rendered without CSS (next/og). */
export const BRAND_HEX = { T: "#faab35", L: "#347ec4", R: "#20508a" } as const;

/** One run of equal pixels in a row: draw as a single rect. */
export const BRAND_RUNS = BRAND_ROWS.flatMap((row, y) => {
  const runs: { x: number; y: number; w: number; c: keyof typeof BRAND_HEX }[] = [];
  for (let x = 0; x < row.length; ) {
    const c = row[x];
    let w = 1;
    while (row[x + w] === c) w++;
    if (c !== ".") runs.push({ x, y, w, c: c as keyof typeof BRAND_HEX });
    x += w;
  }
  return runs;
});
