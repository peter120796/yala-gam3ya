import { addMonthsToKey, compareDates, monthKey, type CivilDate } from "./dates";
import { sum, type Piasters } from "./money";
import { deriveContributionStatus, derivePayoutStatus, isContributionSettled } from "./status";
import type { ContributionRecordStatus, ContributionStatus, PayoutRecordStatus, PayoutStatus } from "./types";

/** One member's obligation row (already scoped to the member by authorization). */
export interface MemberObligation {
  gam3yaId: string;
  cycleNumber: number;
  dueDate: CivilDate;
  amount: Piasters;
  record: ContributionRecordStatus | null;
  graceDays: number;
}

/** One member's expected payout (their portion of the cycle pot). */
export interface MemberPayout {
  gam3yaId: string;
  cycleNumber: number;
  payoutDate: CivilDate;
  amount: Piasters;
  record: PayoutRecordStatus | null;
  graceDays: number;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  scheduledContributions: Piasters;
  recordedPaidContributions: Piasters;
  waivedContributions: Piasters;
  outstandingContributions: Piasters;
  expectedPayouts: Piasters;
  confirmedPayouts: Piasters;
}

export function contributionStatusOf(o: MemberObligation, today: CivilDate): ContributionStatus {
  return deriveContributionStatus(o.dueDate, o.record, today);
}

export function payoutStatusOf(p: MemberPayout, today: CivilDate): PayoutStatus {
  return derivePayoutStatus(p.payoutDate, p.record, today);
}

/**
 * Contributions and payouts for a month are reported separately — they are
 * never netted against each other here (see planningNet for a labelled estimate).
 */
export function summarizeMonth(
  month: string,
  obligations: readonly MemberObligation[],
  payouts: readonly MemberPayout[],
): MonthSummary {
  const inMonth = obligations.filter((o) => monthKey(o.dueDate) === month);
  const payoutsInMonth = payouts.filter((p) => monthKey(p.payoutDate) === month);
  const by = (pred: (o: MemberObligation) => boolean) => sum(inMonth.filter(pred).map((o) => o.amount));

  return {
    month,
    scheduledContributions: by(() => true),
    recordedPaidContributions: by((o) => o.record === "recorded_paid"),
    waivedContributions: by((o) => o.record === "waived"),
    outstandingContributions: by((o) => !isContributionSettled(o.record)),
    expectedPayouts: sum(payoutsInMonth.map((p) => p.amount)),
    confirmedPayouts: sum(payoutsInMonth.filter((p) => p.record === "confirmed_completed").map((p) => p.amount)),
  };
}

export function remainingInstallments(obligations: readonly MemberObligation[]): {
  count: number;
  amount: Piasters;
} {
  const open = obligations.filter((o) => !isContributionSettled(o.record));
  return { count: open.length, amount: sum(open.map((o) => o.amount)) };
}

/** Next not-yet-confirmed payout on or after today (delayed past ones excluded). */
export function nextPayout<T extends MemberPayout>(payouts: readonly T[], today: CivilDate): T | null {
  const upcoming = payouts
    .filter((p) => p.record !== "confirmed_completed" && p.record !== "reported_completed")
    .filter((p) => compareDates(p.payoutDate, today) >= 0)
    .sort((a, b) => compareDates(a.payoutDate, b.payoutDate) || a.gam3yaId.localeCompare(b.gam3yaId));
  return upcoming[0] ?? null;
}

export function upcomingContributions<T extends MemberObligation>(
  obligations: readonly T[],
  today: CivilDate,
  limit = 5,
): (T & { status: ContributionStatus })[] {
  return obligations
    .filter((o) => !isContributionSettled(o.record))
    .map((o) => ({ ...o, status: contributionStatusOf(o, today) }))
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.gam3yaId.localeCompare(b.gam3yaId))
    .slice(0, limit);
}

export interface ProjectionPoint {
  month: string;
  contributions: Piasters;
  payouts: Piasters;
}

/** Scheduled contributions and expected payouts per month for `months` months. */
export function projection(
  fromMonth: string,
  months: number,
  obligations: readonly { dueDate: CivilDate; amount: Piasters }[],
  payouts: readonly { payoutDate: CivilDate; amount: Piasters }[],
): ProjectionPoint[] {
  const points: ProjectionPoint[] = [];
  for (let i = 0; i < months; i++) {
    const month = addMonthsToKey(fromMonth, i);
    points.push({
      month,
      contributions: sum(obligations.filter((o) => monthKey(o.dueDate) === month).map((o) => o.amount)),
      payouts: sum(payouts.filter((p) => monthKey(p.payoutDate) === month).map((p) => p.amount)),
    });
  }
  return points;
}

/**
 * Planning estimate only: expected payouts minus scheduled contributions.
 * The UI must label this as an estimate — it is not money received.
 */
export function planningNet(summary: Pick<MonthSummary, "expectedPayouts" | "scheduledContributions">): Piasters {
  return summary.expectedPayouts - summary.scheduledContributions;
}
