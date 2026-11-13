import type { CivilDate } from "./dates";
import type { Piasters } from "./money";

export type Frequency = "monthly" | "biweekly" | "weekly";

export interface Gam3yaConfig {
  /** Number of shares == number of cycles (one payout per cycle). */
  totalShares: number;
  contributionPerShare: Piasters;
  frequency: Frequency;
  /** Earliest date the first contribution may fall on. */
  startDate: CivilDate;
  /** Day of month contributions are due (monthly only, 1..31; clamped to month end). */
  dueDay: number | null;
  /** Days after the due date that the cycle's payout is scheduled. */
  payoutOffsetDays: number;
  /** Days after the due date before an unpaid contribution counts as overdue. */
  graceDays: number;
}

/** A member's ownership of (part of) a share. 10_000 bp = whole share. */
export interface ShareHolding {
  shareNumber: number;
  memberId: string;
  portionBp: number;
}

/** Which cycle a share receives its payout in. */
export interface PayoutTurn {
  shareNumber: number;
  cycleNumber: number;
}

export interface Cycle {
  cycleNumber: number;
  dueDate: CivilDate;
  payoutDate: CivilDate;
  recipientShare: number;
  /** Total pot distributed this cycle. */
  payoutAmount: Piasters;
}

export interface Obligation {
  cycleNumber: number;
  memberId: string;
  dueDate: CivilDate;
  amount: Piasters;
  /** Shares (and portions) this obligation covers — for display/explanation. */
  shares: { shareNumber: number; portionBp: number }[];
}

export interface PayoutRecipient {
  memberId: string;
  portionBp: number;
  amount: Piasters;
}

export interface ExpectedPayout {
  cycleNumber: number;
  shareNumber: number;
  payoutDate: CivilDate;
  amount: Piasters;
  recipients: PayoutRecipient[];
}

export interface Schedule {
  cycles: Cycle[];
  obligations: Obligation[];
  payouts: ExpectedPayout[];
  totals: {
    cycleCount: number;
    payoutPerCycle: Piasters;
    contributionPerShareTotal: Piasters;
    grandTotal: Piasters;
    endDate: CivilDate;
  };
}

/** Stored (recorded) statuses — informational, never bank-verified. */
export type ContributionRecordStatus = "reported_paid" | "recorded_paid" | "waived";
export type PayoutRecordStatus = "reported_completed" | "confirmed_completed" | "delayed";

/** Display statuses = stored record (if any) + date-derived state. */
export type ContributionStatus = "upcoming" | "due" | ContributionRecordStatus;
export type PayoutStatus = "scheduled" | "due" | "delayed" | "reported_completed" | "confirmed_completed";

export type Gam3yaLifecycle = "draft" | "active" | "needs_closure" | "completed" | "cancelled";
