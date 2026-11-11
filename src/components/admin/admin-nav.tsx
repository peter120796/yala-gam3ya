"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  ["/admin", "overview"],
  ["/admin/approvals", "approvals"],
  ["/admin/users", "users"],
  ["/admin/gam3yas", "gam3yas"],
  ["/admin/requests", "requests"],
  ["/admin/reports", "reports"],
  ["/admin/audit", "audit"],
  ["/admin/policies", "policies"],
] as const;

export function AdminNav() {
  const t = useTranslations("admin");
  const path = usePathname();
  return (
    <nav aria-label={t("title")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 rounded-xl bg-muted p-1">
        {TABS.map(([href, key]) => {
          const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground", active && "bg-card text-foreground shadow-xs")}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
