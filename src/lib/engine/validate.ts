import { isValidDate } from "./dates";
import { FULL_SHARE_BP, HALF_SHARE_BP, isExactPortion, multiply } from "./money";
import type { Gam3yaConfig, PayoutTurn, ShareHolding } from "./types";

export const LIMITS = {
  minShares: 2,
  maxShares: 120,
  maxHoldersPerShare: 2,
  /** Largest contribution per share: EGP 10,000,000. */
  maxContributionPerShare: 1_000_000_000,
  maxGraceDays: 30,
  maxPayoutOffset: { monthly: 27, biweekly: 13, weekly: 6 },
} as const;

/** MVP: whole shares and halves (نص سهم). */
export const DEFAULT_ALLOWED_PORTIONS: readonly number[] = [FULL_SHARE_BP, HALF_SHARE_BP];

export type ValidationIssue =
  | { code: "INVALID_TOTAL_SHARES"; min: number; max: number }
  | { code: "INVALID_CONTRIBUTION" }
  | { code: "INVALID_START_DATE" }
  | { code: "INVALID_DUE_DAY" }
  | { code: "DUE_DAY_NOT_ALLOWED_FOR_FREQUENCY" }
  | { code: "INVALID_PAYOUT_OFFSET"; max: number }
  | { code: "INVALID_GRACE_DAYS"; max: number }
  | { code: "SHARE_OUT_OF_RANGE"; shareNumber: number }
  | { code: "SHARE_UNASSIGNED"; shareNumber: number }
  | { code: "SHARE_PORTIONS_NOT_FULL"; shareNumber: number; totalBp: number }
  | { code: "SHARE_TOO_MANY_HOLDERS"; shareNumber: number; max: number }
  | { code: "DUPLICATE_HOLDER"; shareNumber: number; memberId: string }
  | { code: "PORTION_NOT_ALLOWED"; shareNumber: number; portionBp: number }
  | { code: "SPLIT_NOT_EXACT"; shareNumber: number; portionBp: number }
  | { code: "TURN_SHARE_OUT_OF_RANGE"; shareNumber: number }
  | { code: "TURN_CYCLE_OUT_OF_RANGE"; cycleNumber: number }
  | { code: "TURN_DUPLICATE_SHARE"; shareNumber: number }
  | { code: "TURN_DUPLICATE_CYCLE"; cycleNumber: number }
  | { code: "TURN_MISSING_FOR_SHARE"; shareNumber: number }
  | { code: "CYCLE_WITHOUT_RECIPIENT"; cycleNumber: number };

export function validateConfig(config: Gam3yaConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { totalShares, contributionPerShare, frequency, startDate, dueDay, payoutOffsetDays, graceDays } = config;

  if (!Number.isInteger(totalShares) || totalShares < LIMITS.minShares || totalShares > LIMITS.maxShares) {
    issues.push({ code: "INVALID_TOTAL_SHARES", min: LIMITS.minShares, max: LIMITS.maxShares });
  }
  if (
    !Number.isSafeInteger(contributionPerShare) ||
    contributionPerShare <= 0 ||
    contributionPerShare > LIMITS.maxContributionPerShare
  ) {
    issues.push({ code: "INVALID_CONTRIBUTION" });
  }
  if (!isValidDate(startDate)) issues.push({ code: "INVALID_START_DATE" });

  if (frequency === "monthly") {
    if (dueDay === null || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      issues.push({ code: "INVALID_DUE_DAY" });
    }
  } else if (dueDay !== null) {
    issues.push({ code: "DUE_DAY_NOT_ALLOWED_FOR_FREQUENCY" });
  }

  const maxOffset = LIMITS.maxPayoutOffset[frequency];
  if (!Number.isInteger(payoutOffsetDays) || payoutOffsetDays < 0 || payoutOffsetDays > maxOffset) {
    issues.push({ code: "INVALID_PAYOUT_OFFSET", max: maxOffset });
  }
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > LIMITS.maxGraceDays) {
    issues.push({ code: "INVALID_GRACE_DAYS", max: LIMITS.maxGraceDays });
  }
  return issues;
}

export function validateHoldings(
  config: Pick<Gam3yaConfig, "totalShares" | "contributionPerShare">,
  holdings: readonly ShareHolding[],
  allowedPortions: readonly number[] = DEFAULT_ALLOWED_PORTIONS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { totalShares, contributionPerShare } = config;
  const byShare = new Map<number, ShareHolding[]>();

  for (const h of holdings) {
    if (!Number.isInteger(h.shareNumber) || h.shareNumber < 1 || h.shareNumber > totalShares) {
      issues.push({ code: "SHARE_OUT_OF_RANGE", shareNumber: h.shareNumber });
      continue;
    }
    const list = byShare.get(h.shareNumber) ?? [];
    list.push(h);
    byShare.set(h.shareNumber, list);
  }

  // Payout per cycle — each split portion of it must also be exact.
  const payoutPerCycle =
    Number.isSafeInteger(contributionPerShare) && Number.isInteger(totalShares)
      ? multiply(contributionPerShare, Math.max(totalShares, 0))
      : 0;

  for (let share = 1; share <= totalShares; share++) {
    const list = byShare.get(share);
    if (!list || list.length === 0) {
      issues.push({ code: "SHARE_UNASSIGNED", shareNumber: share });
      continue;
    }
    if (list.length > LIMITS.maxHoldersPerShare) {
      issues.push({ code: "SHARE_TOO_MANY_HOLDERS", shareNumber: share, max: LIMITS.maxHoldersPerShare });
    }
    const seen = new Set<string>();
    let totalBp = 0;
    for (const h of list) {
      if (seen.has(h.memberId)) {
        issues.push({ code: "DUPLICATE_HOLDER", shareNumber: share, memberId: h.memberId });
      }
      seen.add(h.memberId);
      if (!allowedPortions.includes(h.portionBp)) {
        issues.push({ code: "PORTION_NOT_ALLOWED", shareNumber: share, portionBp: h.portionBp });
      } else if (
        !isExactPortion(contributionPerShare, h.portionBp) ||
        !isExactPortion(payoutPerCycle, h.portionBp)
      ) {
        issues.push({ code: "SPLIT_NOT_EXACT", shareNumber: share, portionBp: h.portionBp });
      }
      totalBp += h.portionBp;
    }
    if (totalBp !== FULL_SHARE_BP) {
      issues.push({ code: "SHARE_PORTIONS_NOT_FULL", shareNumber: share, totalBp });
    }
  }
  return issues;
}

export function validateTurns(totalShares: number, turns: readonly PayoutTurn[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const shareSeen = new Set<number>();
  const cycleSeen = new Set<number>();

  for (const t of turns) {
    if (!Number.isInteger(t.shareNumber) || t.shareNumber < 1 || t.shareNumber > totalShares) {
      issues.push({ code: "TURN_SHARE_OUT_OF_RANGE", shareNumber: t.shareNumber });
      continue;
    }
    if (!Number.isInteger(t.cycleNumber) || t.cycleNumber < 1 || t.cycleNumber > totalShares) {
      issues.push({ code: "TURN_CYCLE_OUT_OF_RANGE", cycleNumber: t.cycleNumber });
      continue;
    }
    if (shareSeen.has(t.shareNumber)) issues.push({ code: "TURN_DUPLICATE_SHARE", shareNumber: t.shareNumber });
    if (cycleSeen.has(t.cycleNumber)) issues.push({ code: "TURN_DUPLICATE_CYCLE", cycleNumber: t.cycleNumber });
    shareSeen.add(t.shareNumber);
    cycleSeen.add(t.cycleNumber);
  }
  for (let n = 1; n <= totalShares; n++) {
    if (!shareSeen.has(n)) issues.push({ code: "TURN_MISSING_FOR_SHARE", shareNumber: n });
    if (!cycleSeen.has(n)) issues.push({ code: "CYCLE_WITHOUT_RECIPIENT", cycleNumber: n });
  }
  return issues;
}

export function validateAll(
  config: Gam3yaConfig,
  holdings: readonly ShareHolding[],
  turns: readonly PayoutTurn[],
  allowedPortions?: readonly number[],
): ValidationIssue[] {
  const configIssues = validateConfig(config);
  // Holdings/turns checks depend on a sane share count & amount.
  if (configIssues.some((i) => i.code === "INVALID_TOTAL_SHARES" || i.code === "INVALID_CONTRIBUTION")) {
    return configIssues;
  }
  return [
    ...configIssues,
    ...validateHoldings(config, holdings, allowedPortions),
    ...validateTurns(config.totalShares, turns),
  ];
}
