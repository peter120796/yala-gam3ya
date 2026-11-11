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

/** Invitation email (link = Firebase one-time "set your password" link). */
export function renderInvite(locale: "ar" | "en", name: string, link: string) {
  const ar = locale === "ar";
  const subject = ar ? "دعوة لـ يلا جمعية" : "Your Yala-Gam3ya invitation";
  const text = ar
    ? `أهلاً ${name}،\nاتعملك حساب على يلا جمعية. اضغط على اللينك ده عشان تختار كلمة السر:\n${link}`
    : `Hi ${name},\nAn account was created for you on Yala-Gam3ya. Use this link to choose your password:\n${link}`;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const html = `<div dir="${ar ? "rtl" : "ltr"}" style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6"><p>${esc(text.split("\n").slice(0, 2).join(" "))}</p><p><a href="${esc(link)}">${ar ? "اختار كلمة السر" : "Choose your password"}</a></p></div>`;
  return { subject, text, html };
}
