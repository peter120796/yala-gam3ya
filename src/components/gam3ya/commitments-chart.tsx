"use client";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toDecimalString } from "@/lib/engine/money";
import { formatMonthKey } from "@/lib/format";
import { usePrivacy } from "@/components/providers/privacy";
import type { ProjectionPoint } from "@/lib/engine/summary";

/**
 * Two series on one axis: contributions (blue) vs expected payouts (emerald) —
 * palette validated for CVD & contrast. Values stay as integer piasters; the
 * display conversion happens only for axis scale. A table view is included.
 */
export function CommitmentsChart({ data, height = 260 }: { data: ProjectionPoint[]; height?: number }) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const { hidden } = usePrivacy();
  const rows = data.map((p) => ({
    label: formatMonthKey(p.month, locale, "short"),
    contributions: Number(toDecimalString(p.contributions)),
    payouts: Number(toDecimalString(p.payouts)),
    raw: p,
  }));
  const fmt = (piasters: number) => (hidden ? "••••" : formatMoney(piasters, locale));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-contrib" /> {t("contributions")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-payout" /> {t("payouts")}
        </span>
      </div>
      <div style={{ height }} dir="ltr" role="img" aria-label={t("monthlyChart")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={locale === "ar" ? [...rows].reverse() : rows} barGap={2} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
            <YAxis
              orientation={locale === "ar" ? "right" : "left"}
              tickLine={false}
              axisLine={false}
              width={hidden ? 8 : 56}
              tick={hidden ? false : { fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", { notation: "compact" }).format(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = (payload[0]!.payload as (typeof rows)[number]).raw;
                return (
                  <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-md" dir={locale === "ar" ? "rtl" : "ltr"}>
                    <div className="mb-1 font-semibold">{formatMonthKey(p.month, locale)}</div>
                    <div>{t("contributions")}: <span className="num font-medium">{fmt(p.contributions)}</span></div>
                    <div>{t("payouts")}: <span className="num font-medium">{fmt(p.payouts)}</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="contributions" fill="var(--chart-contrib)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="payouts" fill="var(--chart-payout)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">{t("monthlyChart")}</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-start font-medium" />
              <th className="py-1 text-end font-medium">{t("contributions")}</th>
              <th className="py-1 text-end font-medium">{t("payouts")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.month} className="border-t">
                <td className="py-1">{formatMonthKey(p.month, locale)}</td>
                <td className="num py-1 text-end">{fmt(p.contributions)}</td>
                <td className="num py-1 text-end">{fmt(p.payouts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
