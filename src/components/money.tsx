"use client";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney, type Piasters } from "@/lib/engine/money";
import { usePrivacy } from "@/components/providers/privacy";
import { cn } from "@/lib/utils";

/** Formats integer piasters for the current locale; masked in privacy mode. */
export function Money({ value, className }: { value: Piasters; className?: string }) {
  const locale = useLocale();
  const { hidden } = usePrivacy();
  const t = useTranslations("common");
  if (hidden) {
    return (
      <span className={cn("num money", className)} aria-label={t("hiddenAmount")}>
        ••••
      </span>
    );
  }
  return <span className={cn("num", className)}>{formatMoney(value, locale)}</span>;
}
