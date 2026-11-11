import Link from "next/link";
import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo, LogoMark } from "@/components/brand/logo";
import { DesktopNav, MobileTabBar } from "@/components/shell/nav-links";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { PrivacyToggle } from "@/components/shell/privacy-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { requireUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/data/reads";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getTranslations();
  const unread = await unreadCount(user.actor).catch(() => 0);
  const isAdmin = user.role === "super_admin";

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        {t("common.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Logo label={t("meta.title")} className="hidden sm:inline-flex" />
              <LogoMark className="sm:hidden" title={t("meta.title")} />
            </Link>
            <DesktopNav isAdmin={isAdmin} />
          </div>
          <div className="flex items-center gap-0.5">
            <PrivacyToggle />
            <Link
              href="/notifications"
              className="relative inline-flex size-10 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`}
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute end-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <LocaleSwitcher compact />
            <ThemeToggle saved={user.theme} signedIn />
            <UserMenu name={user.displayName} isAdmin={isAdmin} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-12">
        {children}
      </main>
      <footer className="mx-auto hidden w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground md:block">
        <p>{t("disclaimer.short")}</p>
        <nav className="mt-2 flex flex-wrap gap-4">
          <Link className="hover:underline" href="/legal/terms">{t("legal.terms")}</Link>
          <Link className="hover:underline" href="/legal/privacy">{t("legal.privacy")}</Link>
          <Link className="hover:underline" href="/legal/disclaimer">{t("legal.disclaimer")}</Link>
          <Link className="hover:underline" href="/legal/subscription">{t("legal.subscription")}</Link>
          <Link className="hover:underline" href="/legal/contact">{t("legal.contact")}</Link>
        </nav>
      </footer>
      <MobileTabBar isAdmin={isAdmin} />
    </div>
  );
}
