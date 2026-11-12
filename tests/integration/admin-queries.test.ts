/**
 * Every admin read model must work on a brand-new, empty project (first deploy)
 * as well as with data in it. Real Firestore rejects some calls on empty input
 * (e.g. getAll() with no references); the in-memory backend mirrors that.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/data/policy";
import { refs, nowIso } from "@/lib/data/store";
import { DEFAULT_NOTIFICATION_PREFS, type UserDoc } from "@/lib/data/types";
import {
  approvalIds,
  getAdminOverview,
  getNeedsAction,
  getReports,
  listAllUsersForPicker,
  listApprovals,
  listAudit,
  listGam3yas,
  listPendingRequests,
  listPolicies,
  listUsers,
  pendingApprovalCount,
} from "@/lib/admin/queries";
import { resetBackend } from "./backend";

const admin: Actor = { uid: "admin", role: "super_admin", isActive: true, approvalStatus: "approved", mfa: true };
const today = "2026-11-12";

async function runAll() {
  await getAdminOverview(admin, today);
  await getNeedsAction(admin, today);
  await getReports(admin, today);
  await listUsers(admin, null, 0);
  await listUsers(admin, "pet", 0);
  await listAllUsersForPicker(admin);
  await listGam3yas(admin, null);
  await listGam3yas(admin, "active");
  await listPendingRequests(admin);
  await listAudit(admin, 0);
  await listPolicies(admin);
  for (const s of ["pending", "approved", "rejected"] as const) {
    await listApprovals(admin, s, null, 0);
    await approvalIds(admin, s, null);
  }
  await pendingApprovalCount(admin);
}

describe("admin read models on an empty project", () => {
  beforeAll(async () => {
    await resetBackend();
  });
  it("every admin tab loads with no data at all", async () => {
    await expect(runAll()).resolves.toBeUndefined();
  });
});

describe("admin read models with only the first admin", () => {
  beforeAll(async () => {
    await resetBackend();
    const now = nowIso();
    await refs.user("admin").set({
      displayName: "Peter", nameLower: "peter", email: "admin@yala.test", emailLower: "admin@yala.test", phone: null, role: "super_admin",
      isActive: true, approvalStatus: "approved", approvedAt: now, approvedBy: null, signupSource: "self", locale: "ar", theme: "system", privacyMode: false,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS, acceptedPolicies: {}, onboardedAt: now, deactivatedAt: null, createdAt: now, updatedAt: now,
    } as UserDoc);
  });
  it("every admin tab loads", async () => {
    await expect(runAll()).resolves.toBeUndefined();
  });
});
