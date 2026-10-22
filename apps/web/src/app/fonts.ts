import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

/**
 * One family in three voices: Geist for the interface, Geist Pixel for the
 * wordmark, counts and small labels (a nod to the voxel city), Geist Mono
 * for opening hours and keyboard keys. All three are free (SIL OFL) and
 * self-hosted by next/font.
 */
const sans = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono", display: "swap" });
// A display face for counts and the wordmark, from the repository: Next.js
// has no metrics for it in its Google Fonts table and warned on every build.
// The file is Latin and Latin Extended (the ranges Google serves), licence
// next to it; the stack falls back to Geist Mono (--font-pixel in globals.css).
const pixel = localFont({
  src: "../assets/fonts/GeistPixel-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-geist-pixel",
  display: "swap",
  adjustFontFallback: false,
});

export const fontVariables = `${sans.variable} ${mono.variable} ${pixel.variable}`;
