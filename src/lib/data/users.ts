import "server-only";
import { adminAuth, db } from "@/lib/firebase/admin";
import { assertNotSelf, assertSuperAdmin, PolicyError, type Actor } from "./policy";
import { audit, bulk, notificationDoc, nowIso, refs } from "./store";
import { DEFAULT_NOTIFICATION_PREFS, type ApprovalStatus, type NotificationPrefs, type Role, type UserDoc } from "./types";

function newUserDoc(p: { email: string | null; displayName: string | null; phone: string | null; locale: "ar" | "en" }, source: UserDoc["signupSource"], approved: boolean, role: Role = "member"): UserDoc {
  const name = (p.displayName?.trim() || p.email?.split("@")[0] || "User").slice(0, 80);
  const now = nowIso();
  return {
    displayName: name,
    nameLower: name.toLowerCase(),
    email: p.email,
    emailLower: p.email?.toLowerCase() ?? null,
    phone: p.phone,
    role,
    isActive: true,
    approvalStatus: approved ? "approved" : "pending",
    approvedAt: approved ? now : null,
    approvedBy: null,
    signupSource: source,
    locale: p.locale,
    theme: "system",
    privacyMode: false,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    acceptedPolicies: {},
    onboardedAt: null,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates the profile on first sign-in / sign-up (self sign-ups start PENDING). */
export async function ensureProfile(uid: string, p: { email: string | null; displayName: string | null; phone: string | null; locale: "ar" | "en" }): Promise<UserDoc> {
  const ref = refs.user(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data()!;
  const doc = newUserDoc(p, "self", false);
  try {
    await ref.create(doc);
  } catch (e) {
    if ((e as { code?: number }).code !== 6) throw e; // created concurrently
    return (await ref.get()).data()!;
  }
  return doc;
}

export async function updateOwnProfile(actor: Actor, patch: { displayName: string; phone: string | null }) {
  await refs.user(actor.uid).update({ displayName: patch.displayName, nameLower: patch.displayName.toLowerCase(), phone: patch.phone, updatedAt: nowIso() });
}

export async function updateOwnPreferences(uid: string, patch: Partial<Pick<UserDoc, "locale" | "theme" | "privacyMode">> & { notificationPrefs?: NotificationPrefs }) {
  await refs.user(uid).set({ ...patch, updatedAt: nowIso() }, { merge: true });
}

/** Records acceptance (version + timestamp) of the current Terms & Privacy. */
export async function acceptPolicies(uid: string, current: { id: string; kind: string }[], locale: string) {
  const firestore = db();
  const accepted: Record<string, string> = {};
  const batch = firestore.batch();
  const at = nowIso();
  for (const p of current) {
    accepted[p.kind] = p.id;
    batch.set(refs.acceptance(uid, p.id), { userId: uid, policyVersionId: p.id, kind: p.kind, acceptedAt: at, locale });
  }
  batch.set(refs.user(uid), { acceptedPolicies: accepted, onboardedAt: at, updatedAt: at }, { merge: true });
  await batch.commit();
}

// ─────────────────────────── Admin operations ───────────────────────────

export async function setUserRole(actor: Actor | null, target: string, role: Role) {
  assertSuperAdmin(actor);
  assertNotSelf(actor, target);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(refs.user(target));
    if (!snap.exists) throw new PolicyError("not_found");
    tx.update(refs.user(target), { role, updatedAt: nowIso() });
    audit(tx, { actorId: actor.uid, action: "user.role_changed", entityType: "user", entityId: target, gam3yaId: null, before: { role: snap.data()!.role }, after: { role }, reason: null });
  });
}

/** Deactivation keeps all history; Auth account is disabled and sessions revoked. */
export async function setUserActive(actor: Actor | null, target: string, active: boolean, reason: string) {
  assertSuperAdmin(actor);
  assertNotSelf(actor, target);
  if (reason.trim().length < 3) throw new PolicyError("reason_required");
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(refs.user(target));
    if (!snap.exists) throw new PolicyError("not_found");
    tx.update(refs.user(target), { isActive: active, deactivatedAt: active ? null : nowIso(), updatedAt: nowIso() });
    audit(tx, { actorId: actor.uid, action: active ? "user.reactivated" : "user.deactivated", entityType: "user", entityId: target, gam3yaId: null, before: null, after: { isActive: active }, reason });
  });
  await adminAuth().updateUser(target, { disabled: !active });
  if (!active) await adminAuth().revokeRefreshTokens(target);
}

/**
 * Bulk approve / reject / reset (≤ 5,000). Audited per user; approved users
 * get an in-app + email notification. Idempotent: unchanged users are skipped.
 */
export async function setApproval(actor: Actor | null, ids: string[], status: ApprovalStatus, reason: string | null): Promise<number> {
  assertSuperAdmin(actor);
  if (ids.length > 5000) throw new PolicyError("invalid_operation");
  const unique = [...new Set(ids)].filter((id) => id !== actor.uid);
  let changed = 0;
  const firestore = db();
  for (let i = 0; i < unique.length; i += 300) {
    const chunk = unique.slice(i, i + 300);
    const snaps = await firestore.getAll(...chunk.map((id) => refs.user(id)));
    const w = bulk();
    const now = nowIso();
    for (const s of snaps) {
      if (!s.exists) continue;
      const u = s.data() as UserDoc;
      if (u.approvalStatus === status) continue;
      changed++;
      void w.update(s.ref, {
        approvalStatus: status,
        approvedAt: status === "approved" ? now : null,
        approvedBy: status === "pending" ? null : actor.uid,
        updatedAt: now,
      });
      void w.create(refs.audit().doc(), { actorId: actor.uid, action: `user.${status}`, entityType: "user", entityId: s.id, gam3yaId: null, before: { approvalStatus: u.approvalStatus }, after: { approvalStatus: status }, reason, createdAt: now });
      if (status === "approved") {
        const key = `account_approved:${s.id}`;
        void w.create(refs.notification(key), notificationDoc({ userId: s.id, kind: "account_approved", gam3yaId: null, params: { name: u.displayName }, dedupeKey: key }));
      }
    }
    await w.close();
  }
  return changed;
}

/**
 * Invitation: creates the Auth user (no password) + an approved profile and
 * returns a one-time "set your password" link. The caller emails it (when
 * email is enabled) and the admin can also copy it to share (e.g. WhatsApp).
 */
export async function inviteUser(actor: Actor | null, input: { email: string; displayName: string; role: Role; locale: "ar" | "en" }, continueUrl: string) {
  assertSuperAdmin(actor);
  const email = input.email.toLowerCase();
  let uid: string;
  try {
    uid = (await adminAuth().createUser({ email, displayName: input.displayName })).uid;
  } catch (e) {
    if ((e as { code?: string }).code === "auth/email-already-exists") throw new PolicyError("duplicate");
    throw e;
  }
  const doc = newUserDoc({ email, displayName: input.displayName, phone: null, locale: input.locale }, "invite", true, input.role);
  doc.approvedBy = actor.uid;
  await db().runTransaction(async (tx) => {
    tx.create(refs.user(uid), doc);
    audit(tx, { actorId: actor.uid, action: "user.invited", entityType: "user", entityId: uid, gam3yaId: null, before: null, after: { role: input.role }, reason: null });
  });
  const link = await adminAuth().generatePasswordResetLink(email, { url: continueUrl });
  return { uid, link };
}

export async function usersByIds(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, UserDoc>();
  const snaps = await db().getAll(...unique.map((id) => refs.user(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as UserDoc]));
}
