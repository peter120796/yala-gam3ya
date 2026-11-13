/**
 * People without an account ("guests"): the admin adds them by name, they can
 * hold full or half shares, but can never organize, sign in, or get reminders.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PolicyError, type Actor } from "@/lib/data/policy";
import { refs, nowIso } from "@/lib/data/store";
import { DEFAULT_NOTIFICATION_PREFS, type UserDoc } from "@/lib/data/types";
import { activateDraft, saveDraft, type DraftInput } from "@/lib/data/gam3yas";
import { createGuest, setUserActive, setUserRole } from "@/lib/data/users";
import { listAllUsersForPicker, listUsers } from "@/lib/admin/queries";
import { computeReminders } from "@/lib/notifications/reminders";
import { fakeAuth, resetBackend } from "./backend";

const admin: Actor = { uid: "admin", role: "super_admin", isActive: true, approvalStatus: "approved", mfa: true };
const org: Actor = { uid: "org", role: "organizer", isActive: true, approvalStatus: "approved", mfa: false };
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof PolicyError ? e.code : String(e)));

async function addUser(uid: string, role: UserDoc["role"]) {
  const now = nowIso();
  await refs.user(uid).set({
    displayName: uid, nameLower: uid, email: `${uid}@yala.test`, emailLower: `${uid}@yala.test`, phone: null, role, isActive: true, approvalStatus: "approved",
    approvedAt: now, approvedBy: null, signupSource: "seed", locale: "ar", theme: "system", privacyMode: false, notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    acceptedPolicies: {}, onboardedAt: now, deactivatedAt: null, createdAt: now, updatedAt: now,
  } as UserDoc);
}

const draft = (holders: [string, string, string], organizer = "org"): DraftInput => ({
  id: null,
  basics: { name: "Neighbours", organizerIds: [organizer] },
  financials: { contributionPerShare: 300_000, totalShares: 2, frequency: "monthly", startDate: "2026-12-01", dueDay: 1, payoutOffsetDays: 0, graceDays: 0, allowSelfReport: true },
  holdings: [
    { shareNumber: 1, userId: holders[0], portionBp: 10000 },
    { shareNumber: 2, userId: holders[1], portionBp: 5000 },
    { shareNumber: 2, userId: holders[2], portionBp: 5000 },
  ],
  turns: [
    { shareNumber: 1, cycleNumber: 1 },
    { shareNumber: 2, cycleNumber: 2 },
  ],
});

let aunt = "";
let cousin = "";

beforeAll(async () => {
  await resetBackend();
  await addUser("admin", "super_admin");
  await addUser("org", "organizer");
  await addUser("m1", "member");
  aunt = (await createGuest(admin, "  Tante   Mona ")).id;
  cousin = (await createGuest(admin, "Karim")).id;
});

describe("guests (names without an account)", () => {
  it("only the admin can add one, with a sensible name", async () => {
    expect(await code(createGuest(org, "Someone"))).toBe("not_authorized");
    expect(await code(createGuest(admin, " x "))).toBe("invalid_operation");
    const doc = (await refs.user(aunt).get()).data()!;
    expect(doc).toMatchObject({ displayName: "Tante Mona", email: null, signupSource: "guest", approvalStatus: "approved", isActive: true, role: "member" });
    expect(doc.notificationPrefs).toEqual({ emailEnabled: false, contributionReminders: false, payoutReminders: false, gam3yaUpdates: false });
  });

  it("can hold full and half shares and the Gam3ya activates", async () => {
    const id = await saveDraft(admin, draft([aunt, "m1", cousin]));
    await activateDraft(admin, id);
    const obs = (await refs.obligations(id).get()).docs.map((d) => d.data());
    expect(obs.filter((o) => o.userId === aunt).every((o) => o.amount === 300_000)).toBe(true);
    expect(obs.filter((o) => o.userId === cousin).every((o) => o.amount === 150_000)).toBe(true);
  });

  it("can't be an organizer or get another role", async () => {
    expect(await code(saveDraft(admin, draft([aunt, "m1", cousin], aunt)))).toBe("guest_not_allowed");
    expect(await code(setUserRole(admin, aunt, "organizer"))).toBe("guest_not_allowed");
    expect(await code(setUserRole(admin, aunt, "member"))).toBe("ok");
  });

  it("show up in the picker and user list, flagged as guests", async () => {
    const picker = await listAllUsersForPicker(admin);
    expect(picker.find((u) => u.id === aunt)).toMatchObject({ isGuest: true });
    expect(picker.find((u) => u.id === "m1")).toMatchObject({ isGuest: false });
    const { rows } = await listUsers(admin, null, 0);
    expect(rows.find((r) => r.id === cousin)?.isGuest).toBe(true);
  });

  it("can be paused without touching sign-in accounts (they have none)", async () => {
    expect(await code(setUserActive(admin, cousin, false, "moved away"))).toBe("ok");
    expect((await refs.user(cousin).get()).data()!.isActive).toBe(false);
    expect(fakeAuth.users.has(cousin)).toBe(false);
  });

  it("never get reminders", () => {
    const r = computeReminders({
      today: "2026-11-28",
      gam3ya: { id: "g", name: "Neighbours", status: "active" },
      obligations: [{ id: "o1", userId: aunt, dueDate: "2026-12-01", graceDays: 0, recordStatus: null }],
      payouts: [],
      activeUsers: new Set(["m1"]), // the daily job leaves guests out
      prefs: new Map(),
    });
    expect(r).toEqual([]);
  });
});
