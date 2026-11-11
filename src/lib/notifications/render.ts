import { createTranslator } from "next-intl";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { isValidDate } from "@/lib/engine/dates";
import { formatCivilDate } from "@/lib/format";

/** Renders a stored notification (kind + params) in the recipient's language. */
export function renderNotification(kind: string, params: Record<string, string | number>, locale: "ar" | "en") {
  const t = createTranslator({ locale, messages: locale === "ar" ? ar : en });
  const values = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, typeof v === "string" && isValidDate(v) ? formatCivilDate(v, locale) : v]),
  );
  const key = `notifications.${kind}`;
  const text = t.has(key as "notifications.test") ? t(key as "notifications.test", values) : kind;
  return { text, subject: t("notifications.emailSubject"), footer: t("notifications.emailFooter"), appName: t("meta.title") };
}
