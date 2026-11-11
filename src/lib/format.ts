import { parseDate, type CivilDate } from "@/lib/engine/dates";
import { intlLocale, type Locale } from "@/i18n/config";

/** Formats a civil date without timezone drift (it is a calendar date, not an instant). */
export function formatCivilDate(date: CivilDate, locale: string, style: "long" | "medium" | "short" = "medium"): string {
  const { y, m, d } = parseDate(date);
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { day: "numeric", month: "long", year: "numeric", weekday: "long" }
      : style === "short"
        ? { day: "numeric", month: "short" }
        : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(intlLocale(locale as Locale), { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonthKey(key: string, locale: string, style: "long" | "short" = "long"): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(intlLocale(locale as Locale), {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatInstant(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale as Locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(date);
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale as Locale)).format(n);
}

/** "in 12 days" / "in 2 months" — days under ~6 weeks, months after. */
export function relativeWhen(days: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale as Locale), { numeric: "auto" });
  return Math.abs(days) < 45 ? rtf.format(days, "day") : rtf.format(Math.round(days / 30.44), "month");
}
