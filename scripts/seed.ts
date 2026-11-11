/**
 * Development seed (Firebase). Creates demo users and two Gam3yas through the
 * SAME service code the app uses (policy checks, engine, transactions).
 *
 *   SEED_ALLOW=true npm run db:seed            # against your dev project
 *   (with emulators: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST)
 *
 * Refuses to run in production. Demo users get SEED_PASSWORD.
 */
import "dotenv/config";
import { adminAuth, db } from "../src/lib/firebase/admin";
import { refs, nowIso } from "../src/lib/data/store";
import { DEFAULT_NOTIFICATION_PREFS, type UserDoc } from "../src/lib/data/types";
import { ensureInitialPolicies } from "../src/lib/data/policies";
import { activateDraft, recordContribution, recordPayout, saveDraft } from "../src/lib/data/gam3yas";
import { addDays, monthWithDay, todayIn } from "../src/lib/engine/dates";
import type { Actor } from "../src/lib/data/policy";

const USERS = [
  { key: "admin", email: "admin@yala.dev", name: "Admin", role: "super_admin" },
  { key: "mona", email: "mona@yala.dev", name: "منى (منظمة)", role: "organizer" },
  { key: "ahmed", email: "ahmed@yala.dev", name: "أحمد", role: "member" },
  { key: "sara", email: "sara@yala.dev", name: "سارة", role: "member" },
  { key: "karim", email: "karim@yala.dev", name: "كريم", role: "member" },
  { key: "nour", email: "nour@yala.dev", name: "نور", role: "member" },
  { key: "omar", email: "omar@yala.dev", name: "عمر", role: "member" },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.SEED_ALLOW !== "true") throw new Error("Seeding is disabled. Set SEED_ALLOW=true (development only).");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set SEED_PASSWORD (10+ chars)");

  await ensureInitialPolicies();
  const policies = (await refs.policies().where("isCurrent", "==", true).get()).docs;
  const accepted = Object.fromEntries(policies.filter((p) => p.get("requiresAcceptance")).map((p) => [p.get("kind"), p.id]));

  const ids: Record<string, string> = {};
  for (const u of USERS) {
    let uid: string;
    try {
      uid = (await adminAuth().createUser({ email: u.email, password, displayName: u.name, emailVerified: true })).uid;
    } catch {
      uid = (await adminAuth().getUserByEmail(u.email)).uid;
    }
    ids[u.key] = uid;
    const now = nowIso();
    const doc: UserDoc = {
      displayName: u.name, nameLower: u.name.toLowerCase(), email: u.email, emailLower: u.email, phone: null, role: u.role, isActive: true,
      approvalStatus: "approved", approvedAt: now, approvedBy: null, signupSource: "seed", locale: "ar", theme: "system", privacyMode: false,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS, acceptedPolicies: accepted, onboardedAt: now, deactivatedAt: null, createdAt: now, updatedAt: now,
    };
    await refs.user(uid).set(doc);
  }

  const admin: Actor = { uid: ids.admin!, role: "super_admin", isActive: true, approvalStatus: "approved", mfa: true };
  const mona: Actor = { uid: ids.mona!, role: "organizer", isActive: true, approvalStatus: "approved", mfa: false };
  const today = todayIn();
  const [y, m] = today.split("-").map(Number) as [number, number];

  const g1 = await saveDraft(admin, {
    id: null,
    basics: { name: "جمعية العيلة", organizerIds: [ids.mona!] },
    financials: { contributionPerShare: 200_000, totalShares: 6, frequency: "monthly", startDate: monthWithDay(y, m, -3, 1), dueDay: 5, payoutOffsetDays: 0, graceDays: 3, allowSelfReport: true },
    holdings: [
      { shareNumber: 1, userId: ids.mona!, portionBp: 10000 },
      { shareNumber: 2, userId: ids.ahmed!, portionBp: 10000 },
      { shareNumber: 3, userId: ids.sara!, portionBp: 5000 },
      { shareNumber: 3, userId: ids.karim!, portionBp: 5000 },
      { shareNumber: 4, userId: ids.nour!, portionBp: 10000 },
      { shareNumber: 5, userId: ids.ahmed!, portionBp: 10000 },
      { shareNumber: 6, userId: ids.omar!, portionBp: 10000 },
    ],
    turns: [1, 2, 3, 4, 5, 6].map((n) => ({ shareNumber: n, cycleNumber: n })),
  });
  await activateDraft(admin, g1);

  const members = [ids.mona!, ids.ahmed!, ids.sara!, ids.karim!, ids.nour!, ids.omar!, ids.ahmed!, ids.sara!, ids.nour!, ids.omar!];
  const g2 = await saveDraft(admin, {
    id: null,
    basics: { name: "جمعية الشغل", organizerIds: [ids.mona!] },
    financials: { contributionPerShare: 100_000, totalShares: 10, frequency: "monthly", startDate: addDays(today, 20), dueDay: 28, payoutOffsetDays: 2, graceDays: 3, allowSelfReport: false },
    holdings: members.map((userId, i) => ({ shareNumber: i + 1, userId, portionBp: 10000 as const })),
    turns: [3, 7, 1, 9, 2, 10, 4, 6, 5, 8].map((shareNumber, i) => ({ shareNumber, cycleNumber: i + 1 })),
  });
  await activateDraft(admin, g2);

  // History: first two cycles of the family Gam3ya recorded by the organizer.
  for (const d of (await refs.obligations(g1).where("cycleNumber", "<=", 2).get()).docs) await recordContribution(mona, g1, d.id, { status: "recorded_paid" });
  for (const d of (await refs.payouts(g1).where("cycleNumber", "<=", 2).get()).docs) await recordPayout(mona, g1, d.id, { status: "confirmed_completed" });

  console.log("✓ seeded. Sign in with:", USERS.map((u) => u.email).join(", "));
  void db;
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
