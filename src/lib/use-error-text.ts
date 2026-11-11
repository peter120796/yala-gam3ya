"use client";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/actions";

/** Turns an ActionResult error into translated text (including engine issues). */
export function useErrorText() {
  const t = useTranslations();
  return (res: Extract<ActionResult<unknown>, { ok: false }>): string => {
    const base = t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.unexpected_error") : t("errors.unexpected_error");
    if (!res.issues?.length) return base;
    const details = res.issues
      .slice(0, 4)
      .map((i) => t(`issues.${i.code}` as "issues.SHARE_UNASSIGNED", i as unknown as Record<string, string>));
    return [base, ...details].join(" • ");
  };
}
