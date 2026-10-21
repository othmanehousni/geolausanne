import { Geist, Geist_Mono, Geist_Pixel } from "next/font/google";

/**
 * One family in three voices: Geist for the interface, Geist Pixel for the
 * wordmark, counts and small labels (a nod to the voxel city), Geist Mono
 * for opening hours and keyboard keys. All three are free (SIL OFL) and
 * self-hosted by next/font.
 */
const sans = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono", display: "swap" });
const pixel = Geist_Pixel({ subsets: ["latin", "latin-ext"], variable: "--font-geist-pixel", display: "swap" });

export const fontVariables = `${sans.variable} ${mono.variable} ${pixel.variable}`;
