import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Origins the browser may talk to, derived from the public configuration. */
function originOf(url: string | undefined): string | null {
  if (!url || url.startsWith("/")) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const city = originOf(process.env.NEXT_PUBLIC_CITY_BASE_URL);
const connect = [
  "'self'",
  "https://api3.geo.admin.ch",
  "https://challenges.cloudflare.com",
  supabase,
  supabase?.replace(/^https:/, "wss:"),
  city,
].filter(Boolean);

// No nonces: Cache Components prerender a static shell (nonce-based CSP is
// incompatible with partial prerendering), so inline scripts are allowed.
// 'wasm-unsafe-eval' is required by the meshopt WebAssembly decoder.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  `connect-src ${connect.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // the root layout lives under app/[locale]; unmatched URLs get
    // app/global-not-found.tsx
    globalNotFound: true,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@geolausanne/geo-types"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const headers = [...securityHeaders];
    if (process.env.NODE_ENV === "production") headers.push({ key: "Content-Security-Policy", value: csp });
    return [
      { source: "/:path*", headers },
      {
        // tiles are content-addressed through ?v=<manifest version>
        source: "/city/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/city/:area/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
