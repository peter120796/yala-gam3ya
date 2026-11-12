import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { publicEnv } from "@/lib/env";

export async function PublicShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo label={t("meta.title")} />
        </Link>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle signedIn={false} />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:items-center sm:pt-0">
        <div className={wide ? "w-full max-w-3xl" : "w-full max-w-md"}>{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        <p>{t("disclaimer.short")}</p>
        <nav className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link className="hover:underline" href="/legal/terms">{t("legal.terms")}</Link>
          <Link className="hover:underline" href="/legal/privacy">{t("legal.privacy")}</Link>
          <Link className="hover:underline" href="/legal/disclaimer">{t("legal.disclaimer")}</Link>
          <Link className="hover:underline" href="/legal/contact">{t("legal.contact")}</Link>
          <Link className="hover:underline" href="/about">{t("about.link")}</Link>
        </nav>
        <p className="mt-2" dir="ltr">v{publicEnv.appVersion}</p>
      </footer>
    </div>
  );
}
