import type { MetadataRoute } from "next";

/** Installable web app (no service worker: the city streams from the network). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GeoLausanne",
    short_name: "GeoLausanne",
    description: "Halal food spots in a block-by-block 3D Lausanne",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8f7f3",
    theme_color: "#f8f7f3",
    lang: "fr",
    categories: ["food", "maps", "navigation"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
