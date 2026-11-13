import "server-only";
import type { Actor } from "@/lib/data/policy";
import { getManageData, getMyObligations, getMyPayouts } from "@/lib/data/reads";
import { deriveContributionStatus, derivePayoutStatus } from "@/lib/engine/status";
import { toDecimalString } from "@/lib/engine/money";

export interface ExportTable {
  title: string;
  header: string[];
  rows: (string | number)[][];
}

type T = (key: string) => string;

/** Builds export rows through the same authorized read models — exports can't exceed what the user may see. */
export async function buildExport(actor: Actor, scope: string, gam3yaId: string | null, today: string, t: T): Promise<ExportTable | null> {
  if (scope === "organizer" && gam3yaId) {
    const data = await getManageData(actor, gam3yaId);
    if (!data) return null;
    const g = data.gam3ya;
    const rows: (string | number)[][] = data.obligations.map(({ o, name, memberNo }) => [
      t("export.contribution"), o.cycleNumber, name ?? `${t("gam3ya.member")} ${memberNo}`, o.dueDate, toDecimalString(o.amount),
      t(`status.contribution.${deriveContributionStatus(o.dueDate, o.recordStatus, today)}`), o.recordedPaymentDate ?? "",
    ]);
    for (const p of data.payouts) {
      rows.push([
        t("export.payout"), p.cycleNumber, `${t("gam3ya.share")} ${p.recipientShare}`, p.scheduledDate, toDecimalString(p.expectedAmount),
        t(`status.payout.${derivePayoutStatus(p.scheduledDate, p.recordStatus, today)}`), p.recordedCompletionDate ?? "",
      ]);
    }
    return { title: g.name, header: [t("export.type"), t("gam3ya.cycle"), t("manage.member"), t("common.date"), t("export.amountEgp"), t("common.status"), t("export.recordedDate")], rows };
  }
  const [obligations, payouts] = await Promise.all([getMyObligations(actor, gam3yaId ?? undefined), getMyPayouts(actor, gam3yaId ?? undefined)]);
  const rows: (string | number)[][] = [
    ...obligations.map((o) => [t("export.contribution"), o.gam3yaName, o.cycleNumber, o.dueDate, toDecimalString(o.amount), t(`status.contribution.${deriveContributionStatus(o.dueDate, o.record, today)}`)]),
    ...payouts.map((p) => [t("export.payout"), p.gam3yaName, p.cycleNumber, p.payoutDate, toDecimalString(p.amount), t(`status.payout.${derivePayoutStatus(p.payoutDate, p.record, today)}`)]),
  ];
  rows.sort((a, b) => String(a[3]).localeCompare(String(b[3])));
  return { title: t("export.mySchedule"), header: [t("export.type"), t("export.gam3ya"), t("gam3ya.cycle"), t("common.date"), t("export.amountEgp"), t("common.status")], rows };
}
