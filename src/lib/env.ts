/** Public (browser-safe) settings. Firebase web config lives in src/lib/firebase/client.ts. */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
};
