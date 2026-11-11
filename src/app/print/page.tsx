import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { buildExport } from "@/lib/export/rows";
import { todayIn } from "@/lib/engine/dates";
import { formatMoney, parseMoneyInput } from "@/lib/engine/money";
import { formatCivilDate } from "@/lib/format";
import { PrintOnLoad } from "./print-on-load";

/** Print-optimised schedule; the browser's "Save as PDF" produces the PDF. */
export default async function PrintPage({ searchParams }: { searchParams: Promise<{ scope?: string; gam3ya?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = sp.scope === "organizer" ? "organizer" : "member";
  const gam3yaId = sp.gam3ya && /^[A-Za-z0-9_-]{1,128}$/.test(sp.gam3ya) ? sp.gam3ya : null;
  const [t, locale] = [await getTranslations(), await getLocale()];
  const today = todayIn();
  const table = await buildExport(user.actor, scope, gam3yaId, today, (k) => t(k as "common.date"));
  if (!table) notFound();
  const dateCol = table.header.indexOf(t("common.date"));
  const amountCol = table.header.indexOf(t("export.amountEgp"));
  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
      <PrintOnLoad />
      <h1 className="text-2xl font-bold">{t("meta.title")} — {table.title}</h1>
      <p className="mt-1 text-sm">{formatCivilDate(today, locale, "long")} · {user.displayName}</p>
      <p className="mt-1 text-xs">{t("disclaimer.statuses")}</p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>{table.header.map((h) => <th key={h} className="border-b-2 border-black py-2 text-start">{h}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-b">
              {r.map((c, j) => (
                <td key={j} className="py-1.5">
                  {j === dateCol ? formatCivilDate(String(c), locale) : j === amountCol ? formatMoney(parseMoneyInput(String(c)) ?? 0, locale) : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-8 text-xs">{t("disclaimer.short")}</p>
    </main>
  );
}
