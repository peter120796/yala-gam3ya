import { generateDueDates } from "./schedule";
import { addDays, monthKey, type CivilDate } from "./dates";
import { FULL_SHARE_BP, HALF_SHARE_BP, multiply, portionOf, type Piasters } from "./money";
import { projection, type ProjectionPoint } from "./summary";

export interface SimulationInput {
  contributionPerShare: Piasters;
  /** Shares the user would hold, in basis points (10_000 = 1 share, 5_000 = half). */
  holdingBp: number;
  /** Total cycles (== total shares) of the hypothetical Gam3ya. */
  durationCycles: number;
  startDate: CivilDate;
  dueDay: number;
  /** Cycle numbers the user expects to receive in (optional; unknown → no payouts shown). */
  turnCycles: number[];
  payoutOffsetDays?: number;
}

export interface SimulationResult {
  before: ProjectionPoint[];
  after: ProjectionPoint[];
  newMonthlyCommitment: Piasters;
  highestCommitment: { month: string; amount: Piasters } | null;
  payoutMonths: { month: string; amount: Piasters }[];
}

export class SimulationError extends Error {}

/**
 * What-if simulation. Pure: it never creates memberships or writes anything.
 * Payouts per turn follow the same rule as real Gam3yas:
 *   pot = contributionPerShare × durationCycles, user receives pot × portion.
 */
export function simulateJoin(
  existing: {
    obligations: readonly { dueDate: CivilDate; amount: Piasters }[];
    payouts: readonly { payoutDate: CivilDate; amount: Piasters }[];
  },
  input: SimulationInput,
  fromMonth: string,
  months = 12,
): SimulationResult {
  const { contributionPerShare, holdingBp, durationCycles, startDate, dueDay, turnCycles } = input;
  if (!Number.isSafeInteger(contributionPerShare) || contributionPerShare <= 0) {
    throw new SimulationError("INVALID_CONTRIBUTION");
  }
  if (!Number.isInteger(durationCycles) || durationCycles < 2 || durationCycles > 120) {
    throw new SimulationError("INVALID_DURATION");
  }
  // Either one half share, or a whole number of shares (mixed 1.5 is modelled as two Gam3ya entries).
  const isHalf = holdingBp === HALF_SHARE_BP;
  if (!Number.isInteger(holdingBp) || (!isHalf && (holdingBp <= 0 || holdingBp % FULL_SHARE_BP !== 0))) {
    throw new SimulationError("INVALID_HOLDING");
  }
  const shareCount = isHalf ? 1 : holdingBp / FULL_SHARE_BP;
  if (shareCount > durationCycles) throw new SimulationError("INVALID_HOLDING");
  if (
    turnCycles.length > shareCount ||
    new Set(turnCycles).size !== turnCycles.length ||
    turnCycles.some((c) => !Number.isInteger(c) || c < 1 || c > durationCycles)
  ) {
    throw new SimulationError("INVALID_TURN");
  }

  const dueDates = generateDueDates({ frequency: "monthly", startDate, dueDay, totalShares: durationCycles });
  const pot = multiply(contributionPerShare, durationCycles);
  const perCycle = isHalf ? portionOf(contributionPerShare, HALF_SHARE_BP) : multiply(contributionPerShare, shareCount);
  const perTurn = isHalf ? portionOf(pot, HALF_SHARE_BP) : pot;

  const hypoObligations = dueDates.map((d) => ({ dueDate: d, amount: perCycle }));
  const hypoPayouts = turnCycles.map((c) => ({
    payoutDate: addDays(dueDates[c - 1]!, input.payoutOffsetDays ?? 0),
    amount: perTurn,
  }));

  const before = projection(fromMonth, months, existing.obligations, existing.payouts);
  const after = projection(
    fromMonth,
    months,
    [...existing.obligations, ...hypoObligations],
    [...existing.payouts, ...hypoPayouts],
  );

  let highest: { month: string; amount: Piasters } | null = null;
  for (const p of after) {
    if (p.contributions > 0 && (!highest || p.contributions > highest.amount)) {
      highest = { month: p.month, amount: p.contributions };
    }
  }

  return {
    before,
    after,
    newMonthlyCommitment: perCycle,
    highestCommitment: highest,
    payoutMonths: hypoPayouts.map((p) => ({ month: monthKey(p.payoutDate), amount: p.amount })),
  };
}
