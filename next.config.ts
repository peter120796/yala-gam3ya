import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Shown in the footer and on the About page.
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };

// The public address (e.g. the short Firebase Hosting domain that proxies to
// App Hosting) — server actions must accept form posts coming from it.
const siteHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host;
  } catch {
    return null;
  }
})();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // The app is almost entirely per-user and dynamic, so we keep the classic
  // request-time rendering model (simpler, no cache-key leakage risk).
  cacheComponents: false,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  experimental: siteHost ? { serverActions: { allowedOrigins: [siteHost] } } : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
