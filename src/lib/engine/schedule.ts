import { addDays, compareDates, parseDate, monthWithDay, type CivilDate } from "./dates";
import { multiply, portionOf, sum } from "./money";
import type {
  Cycle,
  ExpectedPayout,
  Frequency,
  Gam3yaConfig,
  Obligation,
  PayoutTurn,
  Schedule,
  ShareHolding,
} from "./types";
import { validateAll, type ValidationIssue } from "./validate";

export class ScheduleValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Invalid Gam3ya configuration: ${issues.map((i) => i.code).join(", ")}`);
    this.name = "ScheduleValidationError";
  }
}

const PERIOD_DAYS: Record<Exclude<Frequency, "monthly">, number> = { weekly: 7, biweekly: 14 };

/**
 * Due dates for every cycle.
 *
 * Monthly: cycle 1 is the first date on/after `startDate` whose day equals
 * `dueDay` (clamped to the month's last day — e.g. 31 → 28/29 Feb, 30 Apr).
 * Every later cycle re-applies the clamp to its own month, so a 31st due day
 * returns to the 31st after February. Weekly/biweekly: start date + n periods.
 */
export function generateDueDates(
  config: Pick<Gam3yaConfig, "frequency" | "startDate" | "dueDay" | "totalShares">,
): CivilDate[] {
  const { frequency, startDate, dueDay, totalShares } = config;
  const dates: CivilDate[] = [];

  if (frequency === "monthly") {
    if (dueDay === null) throw new RangeError("monthly schedules need a due day");
    const { y, m } = parseDate(startDate);
    let offset = 0;
    if (compareDates(monthWithDay(y, m, 0, dueDay), startDate) < 0) offset = 1;
    for (let i = 0; i < totalShares; i++) dates.push(monthWithDay(y, m, offset + i, dueDay));
  } else {
    const period = PERIOD_DAYS[frequency];
    for (let i = 0; i < totalShares; i++) dates.push(addDays(startDate, i * period));
  }
  return dates;
}

/**
 * Deterministic schedule generation. Same inputs → identical output (all
 * arrays are sorted by stable keys). Throws ScheduleValidationError when the
 * configuration, share holdings or payout turns are inconsistent.
 */
export function generateSchedule(
  config: Gam3yaConfig,
  holdings: readonly ShareHolding[],
  turns: readonly PayoutTurn[],
  allowedPortions?: readonly number[],
): Schedule {
  const issues = validateAll(config, holdings, turns, allowedPortions);
  if (issues.length > 0) throw new ScheduleValidationError(issues);

  const { totalShares, contributionPerShare, payoutOffsetDays } = config;
  const dueDates = generateDueDates(config);
  const payoutPerCycle = multiply(contributionPerShare, totalShares);

  const shareByCycle = new Map(turns.map((t) => [t.cycleNumber, t.shareNumber]));
  const holdersByShare = new Map<number, ShareHolding[]>();
  for (const h of holdings) {
    const list = holdersByShare.get(h.shareNumber) ?? [];
    list.push(h);
    holdersByShare.set(h.shareNumber, list);
  }
  for (const list of holdersByShare.values()) {
    list.sort((a, b) => b.portionBp - a.portionBp || a.memberId.localeCompare(b.memberId));
  }

  // Each member's per-cycle obligation = Σ (contributionPerShare × portion) over their holdings.
  const memberShares = new Map<string, { shareNumber: number; portionBp: number }[]>();
  for (const h of holdings) {
    const list = memberShares.get(h.memberId) ?? [];
    list.push({ shareNumber: h.shareNumber, portionBp: h.portionBp });
    memberShares.set(h.memberId, list);
  }
  const memberIds = [...memberShares.keys()].sort();
  for (const list of memberShares.values()) list.sort((a, b) => a.shareNumber - b.shareNumber);

  const cycles: Cycle[] = [];
  const obligations: Obligation[] = [];
  const payouts: ExpectedPayout[] = [];

  for (let c = 1; c <= totalShares; c++) {
    const dueDate = dueDates[c - 1]!;
    const payoutDate = addDays(dueDate, payoutOffsetDays);
    const recipientShare = shareByCycle.get(c)!;

    cycles.push({ cycleNumber: c, dueDate, payoutDate, recipientShare, payoutAmount: payoutPerCycle });

    for (const memberId of memberIds) {
      const shares = memberShares.get(memberId)!;
      obligations.push({
        cycleNumber: c,
        memberId,
        dueDate,
        amount: sum(shares.map((s) => portionOf(contributionPerShare, s.portionBp))),
        shares,
      });
    }

    const recipients = holdersByShare.get(recipientShare)!.map((h) => ({
      memberId: h.memberId,
      portionBp: h.portionBp,
      amount: portionOf(payoutPerCycle, h.portionBp),
    }));
    payouts.push({ cycleNumber: c, shareNumber: recipientShare, payoutDate, amount: payoutPerCycle, recipients });
  }

  // Invariants — a schedule that breaks these is a bug, never shipped.
  const totalIn = sum(obligations.map((o) => o.amount));
  const totalOut = sum(payouts.flatMap((p) => p.recipients.map((r) => r.amount)));
  if (totalIn !== totalOut || totalIn !== multiply(payoutPerCycle, totalShares)) {
    throw new Error(`Schedule invariant broken: in=${totalIn} out=${totalOut}`);
  }

  return {
    cycles,
    obligations,
    payouts,
    totals: {
      cycleCount: totalShares,
      payoutPerCycle,
      contributionPerShareTotal: multiply(contributionPerShare, totalShares),
      grandTotal: totalIn,
      endDate: payouts[payouts.length - 1]!.payoutDate,
    },
  };
}

/** Sequential default order: share n gets cycle n. */
export function sequentialTurns(totalShares: number): PayoutTurn[] {
  return Array.from({ length: totalShares }, (_, i) => ({ shareNumber: i + 1, cycleNumber: i + 1 }));
}
