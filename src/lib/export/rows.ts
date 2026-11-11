import "server-only";
import type { Tx } from "@/lib/db/client";
import { getManageData, getMyObligations, getMyPayouts } from "@/lib/gam3ya/queries";
import { deriveContributionStatus, derivePayoutStatus } from "@/lib/engine/status";
import { toDecimalString } from "@/lib/engine/money";
import type { ContributionRecordStatus, PayoutRecordStatus } from "@/lib/engine/types";

export interface ExportTable {
  title: string;
  header: string[];
  rows: (string | number)[][];
}

type T = (key: string) => string;

/** Builds export rows inside the user's RLS scope — exports can't exceed what the user may see. */
export async function buildExport(tx: Tx, userId: string, scope: string, gam3yaId: string | null, today: string, t: T): Promise<ExportTable | null> {
  if (scope === "organizer" && gam3yaId) {
    const data = await getManageData(tx, gam3yaId);
    if (!data || data.obligations.length === 0) return null; // RLS: not a manager → no rows
    const g = data.gam3ya;
    const rows: (string | number)[][] = data.obligations.map(({ o, name }) => [
      t("export.contribution"),
      o.cycleNumber,
      name,
      o.dueDate,
      toDecimalString(o.amount),
      t(`status.contribution.${deriveContributionStatus(o.dueDate, o.recordStatus as ContributionRecordStatus | null, today, g.graceDays)}`),
      o.recordedPaymentDate ?? "",
    ]);
    for (const p of data.payouts) {
      rows.push([
        t("export.payout"),
        p.cycleNumber,
        `${t("gam3ya.share")} ${p.recipientShare}`,
        p.scheduledDate,
        toDecimalString(p.expectedAmount),
        t(`status.payout.${derivePayoutStatus(p.scheduledDate, p.recordStatus as PayoutRecordStatus | null, today, g.graceDays)}`),
        p.recordedCompletionDate ?? "",
      ]);
    }
    return { title: g.name, header: [t("export.type"), t("gam3ya.cycle"), t("manage.member"), t("common.date"), t("export.amountEgp"), t("common.status"), t("export.recordedDate")], rows };
  }

  const obligations = await getMyObligations(tx, userId, gam3yaId ?? undefined);
  const payouts = await getMyPayouts(tx, userId, gam3yaId ?? undefined);
  const rows: (string | number)[][] = [
    ...obligations.map((o) => [
      t("export.contribution"),
      o.gam3yaName,
      o.cycleNumber,
      o.dueDate,
      toDecimalString(o.amount),
      t(`status.contribution.${deriveContributionStatus(o.dueDate, o.record, today, o.graceDays)}`),
    ]),
    ...payouts.map((p) => [
      t("export.payout"),
      p.gam3yaName,
      p.cycleNumber,
      p.payoutDate,
      toDecimalString(p.amount),
      t(`status.payout.${derivePayoutStatus(p.payoutDate, p.record, today, p.graceDays)}`),
    ]),
  ];
  rows.sort((a, b) => String(a[3]).localeCompare(String(b[3])));
  return { title: t("export.mySchedule"), header: [t("export.type"), t("export.gam3ya"), t("gam3ya.cycle"), t("common.date"), t("export.amountEgp"), t("common.status")], rows };
}
