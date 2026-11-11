"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, FlaskConical, History, House, Settings, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", key: "dashboard", icon: House },
  { href: "/overview", key: "overview", icon: CalendarDays },
  { href: "/history", key: "history", icon: History },
  { href: "/simulator", key: "simulator", icon: FlaskConical },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/gam3yas") : path.startsWith(href);
}

export function DesktopNav({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const items = isAdmin ? [...ITEMS, { href: "/admin", key: "admin", icon: ShieldCheck } as const] : ITEMS;
  return (
    <nav aria-label={t("menu")} className="hidden items-center gap-1 md:flex">
      {items.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(path, href) && "bg-accent text-accent-foreground hover:bg-accent",
          )}
        >
          <Icon className="size-4" />
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

export function MobileTabBar({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const items = isAdmin ? [...ITEMS.slice(0, 4), { href: "/admin", key: "admin", icon: ShieldCheck } as const] : ITEMS;
  return (
    <nav
      aria-label={t("menu")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, key, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground",
                isActive(path, href) && "text-primary",
              )}
            >
              <Icon className="size-5" />
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
