import { describe, expect, it } from "vitest";
import {
  applySwap,
  assertParticipantsApproved,
  canSeeObligation,
  canSeePayout,
  canView,
  decideContributionRecord,
  decidePayoutRecord,
  decideProposeSwap,
  isSuperAdmin,
  PolicyError,
  type Actor,
} from "./policy";
import { computeReminders } from "@/lib/notifications/reminders";

const actor = (uid: string, over: Partial<Actor> = {}): Actor => ({ uid, role: "member", isActive: true, approvalStatus: "approved", mfa: false, ...over });
const admin = actor("admin", { role: "super_admin", mfa: true });
const org = actor("org1", { role: "organizer" });
const m1 = actor("m1");
const m2 = actor("m2");
const g = (over: object = {}) => ({
  status: "active" as const,
  organizerIds: ["org1"],
  memberIds: ["m1", "m2"],
  allowSelfReport: false,
  holdings: [],
  currentScheduleVersion: 1,
  totalShares: 4,
  ...over,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as PolicyError).code;
  }
  return "ok";
};
const T = "2026-11-11";

describe("roles & visibility (member/organizer isolation, scenarios 13–15)", () => {
  it("super admin needs approval, active account, role AND MFA", () => {
    expect(isSuperAdmin(admin)).toBe(true);
    expect(isSuperAdmin({ ...admin, mfa: false })).toBe(false);
    expect(isSuperAdmin({ ...admin, isActive: false })).toBe(false);
    expect(isSuperAdmin({ ...admin, approvalStatus: "pending" })).toBe(false);
    expect(isSuperAdmin(org)).toBe(false);
  });
  it("members see their Gam3yas but never drafts; outsiders see nothing", () => {
    expect(canView(m1, g())).toBe(true);
    expect(canView(m1, g({ status: "draft" }))).toBe(false);
    expect(canView(actor("outsider"), g())).toBe(false);
    expect(canView(org, g({ status: "draft" }))).toBe(true);
  });
  it("pending, rejected or deactivated users see nothing", () => {
    expect(canView({ ...m1, approvalStatus: "pending" }, g())).toBe(false);
    expect(canView({ ...m1, approvalStatus: "rejected" }, g())).toBe(false);
    expect(canView({ ...m1, isActive: false }, g())).toBe(false);
    expect(canView({ ...org, isActive: false }, g())).toBe(false);
  });
  it("members see only their own obligations/payouts (IDOR); managers see all", () => {
    expect(canSeeObligation(m1, g(), { userId: "m1" })).toBe(true);
    expect(canSeeObligation(m1, g(), { userId: "m2" })).toBe(false);
    expect(canSeeObligation(org, g(), { userId: "m2" })).toBe(true);
    expect(canSeePayout(m1, g(), { recipientIds: ["m2"] })).toBe(false);
    expect(canSeePayout(m1, g(), { recipientIds: ["m1", "m2"] })).toBe(true);
  });
  it("an organizer has no rights over a Gam3ya they don't organize", () => {
    expect(canView(org, g({ organizerIds: ["org2"] }))).toBe(false);
  });
});

describe("contribution recording (port of app.record_contribution)", () => {
  const ob = (over: object = {}) => ({ userId: "m1", recordStatus: null, ...over });
  it("organizer records paid with date; defaults to today", () => {
    expect(decideContributionRecord(org, g(), ob(), { status: "recorded_paid", paymentDate: "2026-11-01" }, T)).toEqual({
      recordStatus: "recorded_paid",
      recordedPaymentDate: "2026-11-01",
      statusReason: null,
    });
    expect(decideContributionRecord(org, g(), ob(), { status: "recorded_paid" }, T).recordedPaymentDate).toBe(T);
  });
  it("members can't record unless self-report is on, and only 'reported_paid' on their own open row", () => {
    expect(code(() => decideContributionRecord(m1, g(), ob(), { status: "reported_paid" }, T))).toBe("not_authorized");
    const sr = g({ allowSelfReport: true });
    expect(code(() => decideContributionRecord(m1, sr, ob(), { status: "reported_paid" }, T))).toBe("ok");
    expect(code(() => decideContributionRecord(m1, sr, ob(), { status: "recorded_paid" }, T))).toBe("not_authorized");
    expect(code(() => decideContributionRecord(m2, sr, ob(), { status: "reported_paid" }, T))).toBe("not_authorized");
    expect(code(() => decideContributionRecord(m1, sr, ob({ recordStatus: "reported_paid" }), { status: "reported_paid" }, T))).toBe("not_authorized");
  });
  it("other organizers and admins without MFA are refused", () => {
    expect(code(() => decideContributionRecord(org, g({ organizerIds: ["org2"] }), ob(), { status: "recorded_paid" }, T))).toBe("not_authorized");
    expect(code(() => decideContributionRecord({ ...admin, mfa: false }, g(), ob(), { status: "recorded_paid" }, T))).toBe("not_authorized");
  });
  it("waiving / clearing need a reason; unchanged status and future dates are rejected", () => {
    expect(code(() => decideContributionRecord(org, g(), ob(), { status: "waived" }, T))).toBe("reason_required");
    expect(code(() => decideContributionRecord(org, g(), ob(), { status: "waived", reason: "group agreed" }, T))).toBe("ok");
    expect(code(() => decideContributionRecord(org, g(), ob({ recordStatus: "recorded_paid" }), { status: null }, T))).toBe("reason_required");
    expect(code(() => decideContributionRecord(org, g(), ob({ recordStatus: "recorded_paid" }), { status: "recorded_paid" }, T))).toBe("status_unchanged");
    expect(code(() => decideContributionRecord(org, g(), ob(), { status: "recorded_paid", paymentDate: "2026-12-01" }, T))).toBe("invalid_operation");
  });
  it("archived Gam3yas are read-only except audited admin corrections", () => {
    const done = g({ status: "completed" });
    expect(code(() => decideContributionRecord(org, done, ob(), { status: "recorded_paid" }, T))).toBe("not_authorized");
    expect(code(() => decideContributionRecord(admin, done, ob(), { status: "waived" }, T))).toBe("reason_required");
    expect(code(() => decideContributionRecord(admin, done, ob(), { status: "waived", reason: "correction" }, T))).toBe("ok");
    expect(code(() => decideContributionRecord(admin, g({ status: "draft" }), ob(), { status: "recorded_paid" }, T))).toBe("invalid_operation");
  });
  it("organizers keep working when a Gam3ya needs closure", () => {
    expect(code(() => decideContributionRecord(org, g({ status: "needs_closure" }), ob(), { status: "recorded_paid" }, T))).toBe("ok");
  });
});

describe("payout recording (port of app.record_payout, scenario 11)", () => {
  const p = (over: object = {}) => ({ recipientIds: ["m1"], recordStatus: null, recordedCompletionDate: null, scheduleVersion: 1, ...over });
  it("delay requires a reason", () => {
    expect(code(() => decidePayoutRecord(org, g(), p(), { status: "delayed" }, T))).toBe("reason_required");
    expect(decidePayoutRecord(org, g(), p(), { status: "delayed", reason: "two members late" }, T).recordStatus).toBe("delayed");
  });
  it("only the recipient can confirm a reported payout", () => {
    const reported = p({ recordStatus: "reported_completed", recordedCompletionDate: "2026-11-10" });
    expect(code(() => decidePayoutRecord(m2, g(), reported, { status: "confirmed_completed" }, T))).toBe("not_authorized");
    expect(decidePayoutRecord(m1, g(), reported, { status: "confirmed_completed" }, T)).toEqual({
      recordStatus: "confirmed_completed",
      recordedCompletionDate: "2026-11-10",
      statusReason: null,
    });
    expect(code(() => decidePayoutRecord(m1, g(), p(), { status: "confirmed_completed" }, T))).toBe("not_authorized");
  });
  it("superseded schedule versions can't be recorded", () => {
    expect(code(() => decidePayoutRecord(org, g({ currentScheduleVersion: 2 }), p(), { status: "reported_completed" }, T))).toBe("invalid_operation");
  });
});

describe("turn swaps (historical preservation)", () => {
  it("organizer proposes with a reason; members can't", () => {
    expect(code(() => decideProposeSwap(org, g(), 2, 4, "needs later turn"))).toBe("ok");
    expect(code(() => decideProposeSwap(m1, g(), 2, 4, "x".repeat(5)))).toBe("not_authorized");
    expect(code(() => decideProposeSwap(org, g(), 2, 2, "same share"))).toBe("invalid_operation");
    expect(code(() => decideProposeSwap(org, g(), 2, 9, "out of range"))).toBe("invalid_operation");
    expect(code(() => decideProposeSwap(org, g(), 2, 4, ""))).toBe("reason_required");
  });
  it("swap produces a new order and refuses recorded payouts", () => {
    const pays = [1, 2, 3, 4].map((s) => ({ recipientShare: s, recordStatus: s === 1 ? ("confirmed_completed" as const) : null }));
    expect(applySwap([1, 2, 3, 4], pays, 2, 4)).toEqual([1, 4, 3, 2]);
    expect(code(() => applySwap([1, 2, 3, 4], pays, 1, 3))).toBe("change_payout_already_recorded");
  });
});

describe("approvals", () => {
  it("participants must be approved and active", () => {
    expect(code(() => assertParticipantsApproved([{ uid: "a", isActive: true, approvalStatus: "approved" }]))).toBe("ok");
    expect(code(() => assertParticipantsApproved([{ uid: "a", isActive: true, approvalStatus: "pending" }]))).toBe("user_not_approved");
    expect(code(() => assertParticipantsApproved([{ uid: "a", isActive: false, approvalStatus: "approved" }]))).toBe("user_not_approved");
  });
});

describe("reminders (scenario 18 + preferences)", () => {
  const base = {
    today: "2026-11-11",
    gam3ya: { id: "g1", name: "Family", status: "active" },
    obligations: [
      { id: "o1", userId: "m1", dueDate: "2026-11-14", graceDays: 3, recordStatus: null },
      { id: "o2", userId: "m2", dueDate: "2026-11-12", graceDays: 3, recordStatus: null },
      { id: "o3", userId: "m1", dueDate: "2026-11-07", graceDays: 3, recordStatus: null },
      { id: "o4", userId: "m1", dueDate: "2026-11-14", graceDays: 3, recordStatus: "recorded_paid" },
    ],
    payouts: [
      { id: "p1", scheduledDate: "2026-11-15", recordStatus: null, isCurrent: true, recipientIds: ["m1", "m2"] },
      { id: "p2", scheduledDate: "2026-12-05", recordStatus: null, isCurrent: true, recipientIds: ["m2"] },
      { id: "p3", scheduledDate: "2026-11-13", recordStatus: null, isCurrent: false, recipientIds: ["m1"] },
    ],
    prefs: new Map(),
    activeUsers: new Set(["m1", "m2"]),
  };
  it("emits the right kinds with deterministic keys and only the Gam3ya name", () => {
    const r = computeReminders(base);
    expect(r.map((x) => `${x.kind}:${x.userId}`).sort()).toEqual(
      ["contribution_due_1d:m2", "contribution_due_3d:m1", "contribution_overdue:m1", "payout_next_month:m2", "payout_this_week:m1", "payout_this_week:m2"].sort(),
    );
    expect(r.every((x) => Object.keys(x.params).sort().join() === "date,gam3ya")).toBe(true);
    expect(computeReminders(base).map((x) => x.dedupeKey)).toEqual(r.map((x) => x.dedupeKey));
  });
  it("respects preferences, inactive users and finished Gam3yas", () => {
    const prefs = new Map([["m1", { emailEnabled: true, contributionReminders: false, payoutReminders: true, gam3yaUpdates: true }]]);
    expect(computeReminders({ ...base, prefs }).some((x) => x.userId === "m1" && x.kind.startsWith("contribution"))).toBe(false);
    expect(computeReminders({ ...base, activeUsers: new Set(["m1"]) }).some((x) => x.userId === "m2")).toBe(false);
    expect(computeReminders({ ...base, gam3ya: { ...base.gam3ya, status: "completed" } })).toEqual([]);
  });
});
