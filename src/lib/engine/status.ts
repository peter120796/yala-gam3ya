import { addDays, compareDates, type CivilDate } from "./dates";
import type {
  ContributionRecordStatus,
  ContributionStatus,
  Gam3yaLifecycle,
  PayoutRecordStatus,
  PayoutStatus,
} from "./types";

/**
 * Display status for a contribution. Recorded statuses win; otherwise the
 * status is derived from dates so it can never go stale:
 *   today < dueDate                    → upcoming
 *   dueDate ≤ today ≤ dueDate + grace  → due
 *   today > dueDate + grace            → overdue
 * "reported_paid" (member self-report) is not settled until an organizer
 * records it as paid.
 */
export function deriveContributionStatus(
  dueDate: CivilDate,
  record: ContributionRecordStatus | null,
  today: CivilDate,
  graceDays: number,
): ContributionStatus {
  if (record) return record;
  if (compareDates(today, dueDate) < 0) return "upcoming";
  if (compareDates(today, addDays(dueDate, graceDays)) <= 0) return "due";
  return "overdue";
}

export function isContributionSettled(record: ContributionRecordStatus | null): boolean {
  return record === "recorded_paid" || record === "waived";
}

/**
 * Display status for a payout. The original scheduled date is never changed;
 * a late payout is shown as "delayed" either because an organizer marked it so
 * or because the grace window passed without a completion record.
 */
export function derivePayoutStatus(
  payoutDate: CivilDate,
  record: PayoutRecordStatus | null,
  today: CivilDate,
  graceDays: number,
): PayoutStatus {
  if (record === "confirmed_completed" || record === "reported_completed") return record;
  if (record === "delayed") return "delayed";
  if (compareDates(today, payoutDate) < 0) return "scheduled";
  if (compareDates(today, addDays(payoutDate, graceDays)) <= 0) return "due";
  return "delayed";
}

export function isPayoutSettled(record: PayoutRecordStatus | null): boolean {
  return record === "confirmed_completed";
}

/**
 * Lifecycle after the scheduled end date. A Gam3ya is never archived just
 * because time passed: everything must be settled (contributions recorded or
 * waived, payouts confirmed). Otherwise it needs closure by the organizer.
 */
export function evaluateLifecycle(input: {
  current: Gam3yaLifecycle;
  endDate: CivilDate;
  today: CivilDate;
  contributionRecords: readonly (ContributionRecordStatus | null)[];
  payoutRecords: readonly (PayoutRecordStatus | null)[];
}): Gam3yaLifecycle {
  const { current, endDate, today, contributionRecords, payoutRecords } = input;
  if (current === "draft" || current === "cancelled" || current === "completed") return current;

  const allSettled =
    contributionRecords.every(isContributionSettled) && payoutRecords.every(isPayoutSettled);
  if (allSettled && contributionRecords.length > 0 && payoutRecords.length > 0) return "completed";
  if (compareDates(today, endDate) > 0) return "needs_closure";
  return "active";
}

/** Cycles whose due date has arrived (0..n). */
export function cyclesElapsed(dueDates: readonly CivilDate[], today: CivilDate): number {
  return dueDates.filter((d) => compareDates(d, today) <= 0).length;
}

/** The cycle currently in progress: the latest one whose due date has arrived (or 1 before start). */
export function currentCycleNumber(dueDates: readonly CivilDate[], today: CivilDate): number {
  return Math.min(Math.max(cyclesElapsed(dueDates, today), 1), dueDates.length);
}
