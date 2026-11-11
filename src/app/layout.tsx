import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { AppProviders } from "@/components/providers/app-providers";
import { getCurrentUser } from "@/lib/auth/session";
import { dirOf, isLocale, defaultLocale } from "@/i18n/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    applicationName: t("title"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  const messages = await getMessages();
  const user = await getCurrentUser().catch(() => null);

  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Africa/Cairo">
          <AppProviders dir={dirOf(locale)} privacyMode={user?.privacyMode ?? false}>
            {children}
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
