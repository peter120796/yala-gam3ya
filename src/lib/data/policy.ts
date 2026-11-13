/**
 * Authorization & state-transition rules — pure functions, fully unit-tested.
 * These replace the Postgres RLS policies / SECURITY DEFINER functions: the
 * server calls them inside a Firestore transaction before any write, and
 * Firestore rules deny all direct client access.
 */
import { compareDates } from "@/lib/engine/dates";
import { FULL_SHARE_BP } from "@/lib/engine/money";
import type { ContributionRecordStatus, Gam3yaLifecycle, PayoutRecordStatus } from "@/lib/engine/types";
import type { ApprovalStatus, Gam3yaDoc, ObligationDoc, PayoutDoc, Role } from "./types";

export interface Actor {
  uid: string;
  role: Role;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  /** Signed in with a second factor (TOTP) — required for super-admin powers. */
  mfa: boolean;
}

type G = Pick<Gam3yaDoc, "status" | "organizerIds" | "memberIds" | "allowSelfReport" | "holdings" | "currentScheduleVersion">;

export class PolicyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PolicyError";
  }
}

export const isUsable = (a: Actor | null): a is Actor => !!a && a.isActive && a.approvalStatus === "approved";
export const isSuperAdmin = (a: Actor | null) => isUsable(a) && a.role === "super_admin" && a.mfa;
export const isOrganizerOf = (a: Actor | null, g: Pick<G, "organizerIds">) => isUsable(a) && g.organizerIds.includes(a.uid);
export const isMemberOf = (a: Actor | null, g: Pick<G, "memberIds" | "status">) =>
  isUsable(a) && g.status !== "draft" && g.memberIds.includes(a.uid);
export const canManage = (a: Actor | null, g: Pick<G, "organizerIds">) => isSuperAdmin(a) || isOrganizerOf(a, g);
export const canView = (a: Actor | null, g: Pick<G, "organizerIds" | "memberIds" | "status">) => canManage(a, g) || isMemberOf(a, g);

/** Member may see an obligation/payout row only if it is theirs; managers see all. */
export const canSeeObligation = (a: Actor | null, g: Pick<G, "organizerIds">, o: Pick<ObligationDoc, "userId">) =>
  canManage(a, g) || (isUsable(a) && o.userId === a.uid);
export const canSeePayout = (a: Actor | null, g: Pick<G, "organizerIds">, p: Pick<PayoutDoc, "recipientIds">) =>
  canManage(a, g) || (isUsable(a) && p.recipientIds.includes(a.uid));

export function assertSuperAdmin(a: Actor | null): asserts a is Actor {
  if (!isSuperAdmin(a)) throw new PolicyError("not_authorized");
}

const hasReason = (r: string | null | undefined) => (r ?? "").trim().length >= 3;
const RECORDABLE: readonly Gam3yaLifecycle[] = ["active", "needs_closure"];

export interface ContributionChange {
  status: ContributionRecordStatus | null;
  paymentDate?: string | null;
  reason?: string | null;
}

/**
 * Port of app.record_contribution(). Returns the fields to write; throws
 * PolicyError with a translatable code otherwise.
 */
export function decideContributionRecord(
  actor: Actor | null,
  g: G,
  o: Pick<ObligationDoc, "userId" | "recordStatus">,
  change: ContributionChange,
  today: string,
): Pick<ObligationDoc, "recordStatus" | "recordedPaymentDate" | "statusReason"> {
  const { status, paymentDate = null, reason = null } = change;
  if (g.status === "draft" || g.status === "cancelled") throw new PolicyError("invalid_operation");

  const manager = isSuperAdmin(actor) || (isOrganizerOf(actor, g) && RECORDABLE.includes(g.status));
  if (!manager) {
    const selfReport =
      isUsable(actor) &&
      o.userId === actor.uid &&
      g.allowSelfReport &&
      RECORDABLE.includes(g.status) &&
      status === "reported_paid" &&
      o.recordStatus === null;
    if (!selfReport) throw new PolicyError("not_authorized");
  }
  if (g.status === "completed" && !isSuperAdmin(actor)) throw new PolicyError("archived_read_only");
  if ((status === "waived" || status === null || g.status === "completed") && !hasReason(reason)) {
    throw new PolicyError("reason_required");
  }
  if (status === o.recordStatus) throw new PolicyError("status_unchanged");
  if (paymentDate && compareDates(paymentDate, today) > 0) throw new PolicyError("invalid_operation");

  return {
    recordStatus: status,
    recordedPaymentDate: status === "recorded_paid" || status === "reported_paid" ? (paymentDate ?? today) : null,
    statusReason: reason?.trim() || null,
  };
}

export interface PayoutChange {
  status: PayoutRecordStatus | null;
  completionDate?: string | null;
  reason?: string | null;
}

/** Port of app.record_payout(): organizers report/confirm/delay; the recipient may confirm receipt. */
export function decidePayoutRecord(
  actor: Actor | null,
  g: G,
  p: Pick<PayoutDoc, "recipientIds" | "recordStatus" | "recordedCompletionDate" | "scheduleVersion">,
  change: PayoutChange,
  today: string,
): Pick<PayoutDoc, "recordStatus" | "recordedCompletionDate" | "statusReason"> {
  const { status, completionDate = null, reason = null } = change;
  if (p.scheduleVersion !== g.currentScheduleVersion) throw new PolicyError("invalid_operation");
  if (g.status === "draft" || g.status === "cancelled") throw new PolicyError("invalid_operation");

  const manager = isSuperAdmin(actor) || (isOrganizerOf(actor, g) && RECORDABLE.includes(g.status));
  const recipientConfirm =
    isUsable(actor) &&
    p.recipientIds.includes(actor.uid) &&
    RECORDABLE.includes(g.status) &&
    p.recordStatus === "reported_completed" &&
    status === "confirmed_completed";
  if (!manager && !recipientConfirm) throw new PolicyError("not_authorized");
  if (g.status === "completed" && !isSuperAdmin(actor)) throw new PolicyError("archived_read_only");
  if ((status === "delayed" || status === null || g.status === "completed") && !hasReason(reason)) {
    throw new PolicyError("reason_required");
  }
  if (status === p.recordStatus) throw new PolicyError("status_unchanged");
  if (completionDate && compareDates(completionDate, today) > 0) throw new PolicyError("invalid_operation");

  return {
    recordStatus: status,
    recordedCompletionDate:
      status === "reported_completed" || status === "confirmed_completed"
        ? (completionDate ?? p.recordedCompletionDate ?? today)
        : null,
    statusReason: reason?.trim() || null,
  };
}

/** Port of app.propose_turn_swap(). */
export function decideProposeSwap(actor: Actor | null, g: G & { totalShares: number }, a: number, b: number, reason: string) {
  if (!canManage(actor, g)) throw new PolicyError("not_authorized");
  if (g.status !== "active") throw new PolicyError("invalid_operation");
  if (!hasReason(reason)) throw new PolicyError("reason_required");
  if (a === b || a < 1 || b < 1 || a > g.totalShares || b > g.totalShares) throw new PolicyError("invalid_operation");
}

/**
 * Port of app.review_change_request() approval: both affected payouts must
 * still be open. Returns the new turn order (old version kept untouched).
 */
export function applySwap(
  turnOrder: readonly number[],
  payoutsOfCurrent: readonly Pick<PayoutDoc, "recipientShare" | "recordStatus">[],
  a: number,
  b: number,
): number[] {
  const affected = payoutsOfCurrent.filter((p) => p.recipientShare === a || p.recipientShare === b);
  if (affected.length !== 2 || affected.some((p) => p.recordStatus !== null && p.recordStatus !== "delayed")) {
    throw new PolicyError("change_payout_already_recorded");
  }
  return turnOrder.map((s) => (s === a ? b : s === b ? a : s));
}

/** Only approved, active users may join a Gam3ya or organize it. */
export function assertParticipantsApproved(users: { uid: string; isActive: boolean; approvalStatus: ApprovalStatus }[]) {
  if (users.some((u) => !u.isActive || u.approvalStatus !== "approved")) throw new PolicyError("user_not_approved");
}

/** Admin user-management guard: never on yourself. */
export function assertNotSelf(actor: Actor, target: string) {
  if (actor.uid === target) throw new PolicyError("invalid_operation");
}

export function shareHolders(g: Pick<Gam3yaDoc, "holdings">, shareNumber: number) {
  return g.holdings.filter((h) => h.shareNumber === shareNumber).sort((x, y) => y.portionBp - x.portionBp);
}

export function isWholeShare(bp: number) {
  return bp === FULL_SHARE_BP;
}


// ─── Member privacy ───

/** Only the platform admin sees real names inside a Gam3ya; everyone else sees "Member 1, 2, 3…". */
export const canSeeMemberNames = (a: Actor | null) => isSuperAdmin(a);

/**
 * Stable per-Gam3ya member numbers: members are numbered 1, 2, 3… in the order
 * of the first share they hold (ties by id), so the number never depends on
 * who is looking.
 */
export function memberNumbers(holdings: Pick<Gam3yaDoc["holdings"][number], "shareNumber" | "userId">[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const h of holdings) first.set(h.userId, Math.min(first.get(h.userId) ?? Infinity, h.shareNumber));
  const ordered = [...first.entries()].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return new Map(ordered.map(([uid], i) => [uid, i + 1]));
}

// ─── "How I'll pay" (طريقة الدفع) ───

export const PAYMENT_METHOD_MAX = 200;

/**
 * Members describe HOW they will pay ("cash to the organizer on the 1st",
 * "InstaPay transfer") — never the details. Links, emails, and long numbers
 * (phone, wallet, card, account or IBAN numbers) are refused.
 */
export function checkPaymentMethodText(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > PAYMENT_METHOD_MAX) throw new PolicyError("invalid_operation");
  const western = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const link = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|eg|io|me|app|link|ly|co)\b)/i.test(western);
  const email = /\S+@\S+/.test(western); // emails and InstaPay addresses (name@instapay)
  const longNumber = /\d(?:[\s\-.]*\d){5,}/.test(western); // 6+ digits, even with spaces or dashes
  if (link || email || longNumber) throw new PolicyError("payment_method_details_not_allowed");
  return text;
}
