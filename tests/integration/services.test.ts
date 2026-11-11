/**
 * Service-level integration tests: real data-layer code (transactions, counters,
 * notifications, permissions) against Firestore semantics. Runs on the
 * in-memory backend by default and on the Firestore emulator via
 * `npm run test:emulator`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/lib/engine/dates";
import { PolicyError, type Actor } from "@/lib/data/policy";
import { DomainError } from "@/lib/gam3ya/errors";
import { refs, nowIso } from "@/lib/data/store";
import { DEFAULT_NOTIFICATION_PREFS, type UserDoc, type Gam3yaDoc, type NotificationDoc } from "@/lib/data/types";
import { activateDraft, evaluateLifecycle, proposeSwap, recordContribution, recordPayout, restoreGam3ya, reviewChangeRequest, saveDraft, type DraftInput } from "@/lib/data/gam3yas";
import { getManageData, getMyObligations, getMyPayouts, getTurns, getGam3yaForViewer, getNotifications } from "@/lib/data/reads";
import { ensureProfile, inviteUser, setApproval, setUserActive } from "@/lib/data/users";
import { runDailyJob } from "@/lib/notifications/job";
import { fakeAuth, resetBackend } from "./backend";

const actor = (uid: string, over: Partial<Actor> = {}): Actor => ({ uid, role: "member", isActive: true, approvalStatus: "approved", mfa: false, ...over });
const admin = actor("admin", { role: "super_admin", mfa: true });
const org1 = actor("org1", { role: "organizer" });
const org2 = actor("org2", { role: "organizer" });
const [m1, m2, m3, , m5] = ["m1", "m2", "m3", "m4", "m5"].map((u) => actor(u));

async function addUser(uid: string, over: Partial<UserDoc> = {}) {
  const now = nowIso();
  await refs.user(uid).set({
    displayName: `User ${uid}`, nameLower: `user ${uid}`, email: `${uid}@yala.test`, emailLower: `${uid}@yala.test`, phone: `0100000${uid.length}`, role: "member",
    isActive: true, approvalStatus: "approved", approvedAt: now, approvedBy: null, signupSource: "seed", locale: "ar", theme: "system", privacyMode: false,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS, acceptedPolicies: {}, onboardedAt: now, deactivatedAt: null, createdAt: now, updatedAt: now, ...over,
  } as UserDoc);
}

const draft = (over: Partial<DraftInput["financials"]> = {}, holdings?: DraftInput["holdings"], organizer = "org1", name = "Family Gam3ya"): DraftInput => {
  const fin = { contributionPerShare: 100_000, totalShares: 4, frequency: "monthly" as const, startDate: "2026-10-01", dueDay: 5, payoutOffsetDays: 0, graceDays: 3, allowSelfReport: false, ...over };
  const h = holdings ?? [
    { shareNumber: 1, userId: "m1", portionBp: 10000 as const },
    { shareNumber: 2, userId: "m2", portionBp: 10000 as const },
    { shareNumber: 3, userId: "m3", portionBp: 5000 as const },
    { shareNumber: 3, userId: "m4", portionBp: 5000 as const },
    { shareNumber: 4, userId: "m1", portionBp: 10000 as const },
  ];
  return { id: null, basics: { name, organizerIds: [organizer] }, financials: fin, holdings: h, turns: Array.from({ length: fin.totalShares }, (_, i) => ({ shareNumber: i + 1, cycleNumber: i + 1 })) };
};
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof PolicyError || e instanceof DomainError ? e.code : String(e)));
const g = async (id: string) => (await refs.gam3ya(id).get()).data() as Gam3yaDoc;

let g1 = "";
let g2 = "";

beforeAll(async () => {
  await resetBackend();
  for (const u of ["admin", "org1", "org2", "m1", "m2", "m3", "m4", "m5"]) await addUser(u, u === "admin" ? { role: "super_admin" } : u.startsWith("org") ? { role: "organizer" } : {});
  g1 = await saveDraft(admin, draft());
  await activateDraft(admin, g1);
  g2 = await saveDraft(admin, draft({ totalShares: 2, contributionPerShare: 250_000 }, [
    { shareNumber: 1, userId: "m2", portionBp: 10000 },
    { shareNumber: 2, userId: "m5", portionBp: 10000 },
  ], "org2", "Work Gam3ya"));
  await activateDraft(admin, g2);
});

describe("drafts & activation", () => {
  it("only an MFA-verified super admin can create drafts", async () => {
    expect(await code(saveDraft({ ...admin, mfa: false }, draft()))).toBe("not_authorized");
    expect(await code(saveDraft(org1, draft()))).toBe("not_authorized");
  });
  it("activation writes a consistent schedule with exact split halves", async () => {
    const doc = await g(g1);
    expect(doc).toMatchObject({ status: "active", endDate: "2027-01-05", openObligations: 16, openPayouts: 4 });
    const obs = (await refs.obligations(g1).get()).docs.map((d) => d.data());
    expect(obs).toHaveLength(16);
    expect(obs.filter((o) => o.userId === "m3").every((o) => o.amount === 50_000)).toBe(true);
    expect(obs.filter((o) => o.userId === "m1").every((o) => o.amount === 200_000)).toBe(true);
    const pays = (await refs.payouts(g1).get()).docs.map((d) => d.data());
    expect(obs.reduce((a, o) => a + (o.amount as number), 0)).toBe(pays.reduce((a, p) => a + (p.expectedAmount as number), 0));
  });
  it("incomplete drafts are rejected with engine issues and stay drafts", async () => {
    const id = await saveDraft(admin, draft({}, [{ shareNumber: 1, userId: "m1", portionBp: 10000 }]));
    const err = (await activateDraft(admin, id).then(() => null, (e: unknown) => e)) as DomainError;
    expect(err.code).toBe("schedule_invalid");
    expect(err.issues.map((i: { code: string }) => i.code)).toContain("SHARE_UNASSIGNED");
    expect((await g(id)).status).toBe("draft");
  });
  it("pending users can't be added to a Gam3ya", async () => {
    await addUser("pend", { approvalStatus: "pending" });
    expect(await code(saveDraft(admin, draft({}, [{ shareNumber: 1, userId: "pend", portionBp: 10000 }])))).toBe("user_not_approved");
  });
});

describe("member isolation (IDOR) & organizer scoping", () => {
  it("members only get their own rows", async () => {
    const mine = await getMyObligations(m1);
    expect(mine.every((o) => o.gam3yaId === g1)).toBe(true);
    expect(mine).toHaveLength(4);
    expect((await getMyPayouts(m1)).map((p) => p.shareNumber).sort()).toEqual([1, 4]);
    expect(await getManageData(m1, g1)).toBeNull();
  });
  it("payout order shows display names only", async () => {
    const view = await getGam3yaForViewer(m3, g1);
    const turns = await getTurns(m3, view!);
    expect(turns[2]!.holders).toEqual([
      { display_name: "User m3", portion_bp: 5000, is_me: true },
      { display_name: "User m4", portion_bp: 5000, is_me: false },
    ]);
    expect(JSON.stringify(turns)).not.toContain("@yala.test");
  });
  it("outsiders and other organizers can't see or record", async () => {
    expect(await getGam3yaForViewer(m5, g1)).toBeNull();
    expect(await getGam3yaForViewer(org2, g1)).toBeNull();
    const ob = (await refs.obligations(g1).where("userId", "==", "m2").get()).docs[0]!;
    expect(await code(recordContribution(org2, g1, ob.id, { status: "recorded_paid" }))).toBe("not_authorized");
    expect(await code(recordContribution(m2, g1, ob.id, { status: "reported_paid" }))).toBe("not_authorized");
  });
});

describe("recording, history, notifications", () => {
  it("organizer records with history + audit and counters move", async () => {
    const ob = (await refs.obligations(g1).where("userId", "==", "m2").where("cycleNumber", "==", 1).get()).docs[0]!;
    await recordContribution(org1, g1, ob.id, { status: "recorded_paid", paymentDate: "2026-10-04" });
    expect((await ob.ref.get()).data()).toMatchObject({ recordStatus: "recorded_paid", recordedBy: "org1", recordedPaymentDate: "2026-10-04" });
    expect((await g(g1)).openObligations).toBe(15);
    const hist = (await refs.records(g1).where("targetId", "==", ob.id).get()).docs.map((d) => d.data());
    expect(hist).toMatchObject([{ fromStatus: null, toStatus: "recorded_paid", userIds: ["m2"] }]);
    expect((await refs.audit().where("entityId", "==", ob.id).get()).size).toBe(1);
    // Clearing needs a reason and re-opens the counter.
    expect(await code(recordContribution(org1, g1, ob.id, { status: null }))).toBe("reason_required");
    await recordContribution(org1, g1, ob.id, { status: null, reason: "entered by mistake" });
    expect((await g(g1)).openObligations).toBe(16);
  });
  it("payout: report → recipient confirms → one notification per recipient", async () => {
    const pid = (await refs.payouts(g1).where("cycleNumber", "==", 1).get()).docs[0]!.id;
    await recordPayout(org1, g1, pid, { status: "reported_completed", completionDate: "2026-10-10" });
    expect(await code(recordPayout(m2, g1, pid, { status: "confirmed_completed" }))).toBe("not_authorized");
    await recordPayout(m1, g1, pid, { status: "confirmed_completed" });
    const notes = (await getNotifications(m1, 50)).filter((n) => n.kind === "payout_marked_completed");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.params).toEqual({ gam3ya: "Family Gam3ya" });
    expect((await g(g1)).openPayouts).toBe(3);
  });
});

describe("turn swaps keep history", () => {
  it("admin approval creates version 2 and leaves version 1 untouched", async () => {
    const rid = await proposeSwap(org1, g1, 2, 4, "m2 needs a later turn");
    expect(await code(reviewChangeRequest(m1, g1, rid, true, null))).toBe("not_authorized");
    await reviewChangeRequest(admin, g1, rid, true, "ok");
    const doc = await g(g1);
    expect(doc.currentScheduleVersion).toBe(2);
    expect(doc.turnOrder).toEqual([1, 4, 3, 2]);
    const v1 = (await refs.payouts(g1).where("scheduleVersion", "==", 1).get()).docs.map((d) => d.data()).sort((a, b) => a.cycleNumber - b.cycleNumber);
    const v2 = (await refs.payouts(g1).where("isCurrent", "==", true).get()).docs.map((d) => d.data()).sort((a, b) => a.cycleNumber - b.cycleNumber);
    expect(v1.map((p) => p.recipientShare)).toEqual([1, 2, 3, 4]);
    expect(v1.every((p) => p.isCurrent === false)).toBe(true);
    expect(v2.map((p) => p.recipientShare)).toEqual([1, 4, 3, 2]);
    expect(v2[0]!.recordStatus).toBe("confirmed_completed");
    expect((await getNotifications(m2, 50)).some((n) => n.kind === "gam3ya_schedule_updated")).toBe(true);
  });
  it("can't swap a turn already paid out", async () => {
    const rid = await proposeSwap(org1, g1, 1, 3, "swap with completed");
    expect(await code(reviewChangeRequest(admin, g1, rid, true, null))).toBe("change_payout_already_recorded");
  });
});

describe("completion & archiving", () => {
  it("settling everything completes + archives; then read-only; admin restore works", async () => {
    for (const d of (await refs.obligations(g2).get()).docs) await recordContribution(org2, g2, d.id, { status: "recorded_paid" });
    expect((await g(g2)).status).toBe("needs_closure"); // end date passed, payouts still open
    for (const d of (await refs.payouts(g2).get()).docs) await recordPayout(org2, g2, d.id, { status: "confirmed_completed" });
    const done = await g(g2);
    expect(done.status).toBe("completed");
    expect(done.archivedAt).not.toBeNull();
    expect((await getNotifications(m5, 50)).some((n) => n.kind === "gam3ya_completed")).toBe(true);
    const anyOb = (await refs.obligations(g2).get()).docs[0]!;
    expect(await code(recordContribution(org2, g2, anyOb.id, { status: null, reason: "undo" }))).toBe("not_authorized");
    expect(await getMyObligations(m5)).toHaveLength(2); // history still visible
    await restoreGam3ya(admin, g2, "correcting an entry");
    expect((await g(g2)).status).toBe("needs_closure");
    expect(await evaluateLifecycle(org2, g2)).toBe("completed");
  });
});

describe("approvals & accounts", () => {
  it("self sign-up starts pending; bulk approve is audited, notifies, and is idempotent", async () => {
    const p1 = await ensureProfile("self1", { email: "s1@x.test", displayName: "Self One", phone: null, locale: "ar" });
    expect(p1.approvalStatus).toBe("pending");
    await ensureProfile("self2", { email: "s2@x.test", displayName: "Self Two", phone: null, locale: "en" });
    expect(await code(setApproval(org1, ["self1"], "approved", null))).toBe("not_authorized");
    expect(await setApproval(admin, ["self1", "self2", "admin"], "approved", "batch")).toBe(2);
    expect(await setApproval(admin, ["self1", "self2"], "approved", "batch")).toBe(0);
    expect((await refs.user("admin").get()).data()!.approvalStatus).toBe("approved");
    const note = (await getNotifications(actor("self1"), 10)).find((n) => n.kind === "account_approved") as NotificationDoc | undefined;
    expect(note?.params).toEqual({ name: "Self One" });
  });
  it("deactivation disables auth, revokes sessions and keeps history", async () => {
    expect(await code(setUserActive(admin, "admin", false, "self"))).toBe("invalid_operation");
    await setUserActive(admin, "m5", false, "left the platform");
    expect(fakeAuth.users.get("m5")).toMatchObject({ disabled: true, revoked: 1 });
    expect(await getMyObligations({ ...m5, isActive: false })).toEqual([]);
    expect((await refs.obligations(g2).where("userId", "==", "m5").get()).size).toBe(2);
    await setUserActive(admin, "m5", true, "came back");
  });
  it("invitations create an approved account and a set-password link", async () => {
    const { uid, link } = await inviteUser(admin, { email: "New@Yala.test", displayName: "Newbie", role: "organizer", locale: "ar" }, "http://localhost/login");
    expect((await refs.user(uid).get()).data()).toMatchObject({ approvalStatus: "approved", role: "organizer", emailLower: "new@yala.test", signupSource: "invite" });
    expect(link).toContain("resetPassword");
    expect(await code(inviteUser(admin, { email: "new@yala.test", displayName: "Again", role: "member", locale: "ar" }, "x"))).toBe("duplicate");
  });
});

describe("daily job", () => {
  it("creates reminders once (idempotent) and processes email via the console provider", async () => {
    const today = todayIn("Africa/Cairo");
    const in3 = addDays(today, 3);
    const id = await saveDraft(admin, draft({ totalShares: 2, startDate: in3, dueDay: Number(in3.slice(8, 10)) }, [
      { shareNumber: 1, userId: "m3", portionBp: 10000 },
      { shareNumber: 2, userId: "m4", portionBp: 10000 },
    ], "org1", "Reminder Gam3ya"));
    await activateDraft(admin, id);
    await refs.user("m4").set({ notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, contributionReminders: false } }, { merge: true });

    const first = await runDailyJob();
    const second = await runDailyJob();
    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    const notes = (await refs.notifications().where("gam3yaId", "==", id).get()).docs.map((d) => d.data() as NotificationDoc);
    expect(notes.filter((n) => n.kind === "contribution_due_3d").map((n) => n.userId)).toEqual(["m3"]);
    expect(notes.filter((n) => n.kind === "payout_this_week").map((n) => n.userId)).toEqual(["m3"]);
    const pending = await refs.notifications().where("emailStatus", "in", ["pending", "sending"]).get();
    expect(pending.size).toBe(0);
    expect(first.email.provider).toBe("console");
  });
});
