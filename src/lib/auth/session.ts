import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";
import { refs } from "@/lib/data/store";
import type { Actor } from "@/lib/data/policy";
import type { ApprovalStatus, NotificationPrefs, PolicyVersionDoc, Role, UserDoc } from "@/lib/data/types";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/data/types";
import { decodeSessionCookie, SESSION_COOKIE } from "./cookie";
import { effectiveRole } from "./admin-emails";

export interface Session {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  /** Signed in with a second factor (TOTP). */
  mfa: boolean;
}

export interface CurrentUser extends Session {
  displayName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  locale: "ar" | "en";
  theme: "light" | "dark" | "system";
  privacyMode: boolean;
  notificationPrefs: NotificationPrefs;
  needsOnboarding: boolean;
  organizesAny: boolean;
  actor: Actor;
}

/** Verified session: Firebase session cookie, checked for revocation. */
export const getSession = cache(async (): Promise<Session | null> => {
  const { s } = decodeSessionCookie((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  try {
    const d = await adminAuth().verifySessionCookie(s, true);
    return {
      userId: d.uid,
      email: d.email ?? null,
      emailVerified: d.email_verified === true,
      mfa: Boolean((d.firebase as { sign_in_second_factor?: string } | undefined)?.sign_in_second_factor),
    };
  } catch {
    return null;
  }
});

// Current policy versions change rarely; cache per server instance for a minute.
let policyCache: { at: number; rows: { id: string; doc: PolicyVersionDoc }[] } | null = null;
export async function currentPolicies() {
  if (policyCache && Date.now() - policyCache.at < 60_000) return policyCache.rows;
  let snap = await refs.policies().where("isCurrent", "==", true).get();
  if (snap.empty) {
    // First deploy: seed the initial policy versions so nobody gets stuck on onboarding.
    const { ensureInitialPolicies } = await import("@/lib/data/policies");
    if (await ensureInitialPolicies()) snap = await refs.policies().where("isCurrent", "==", true).get();
  }
  const rows = snap.docs.map((d) => ({ id: d.id, doc: d.data() as PolicyVersionDoc }));
  policyCache = { at: Date.now(), rows };
  return rows;
}
export function invalidatePolicyCache() {
  policyCache = null;
}

export function actorFromUser(uid: string, u: Pick<UserDoc, "role" | "isActive" | "approvalStatus">, mfa: boolean): Actor {
  return { uid, role: u.role, isActive: u.isActive, approvalStatus: u.approvalStatus, mfa };
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const snap = await refs.user(session.userId).get();
  if (!snap.exists) return null;
  const stored = snap.data()!;
  // Admin rights only for the emails in ADMIN_EMAILS.
  const u = { ...stored, role: effectiveRole(stored.role, session.email) };
  const required = (await currentPolicies()).filter((p) => p.doc.requiresAcceptance);
  const needsOnboarding = required.some((p) => u.acceptedPolicies?.[p.doc.kind] !== p.id) || required.length < 2;
  const organizes = await refs.gam3yas().where("organizerIds", "array-contains", session.userId).limit(1).get();
  return {
    ...session,
    displayName: u.displayName,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    approvalStatus: u.approvalStatus,
    locale: u.locale ?? "ar",
    theme: u.theme ?? "system",
    privacyMode: u.privacyMode ?? false,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...u.notificationPrefs },
    needsOnboarding,
    organizesAny: !organizes.empty,
    actor: actorFromUser(session.userId, u, session.mfa),
  };
});

/** Page guard: signed in, active, approved, onboarded. */
export async function requireUser(opts: { allowOnboarding?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/auth/signout?reason=deactivated");
  if (user.approvalStatus !== "approved") redirect("/pending");
  if (user.needsOnboarding && !opts.allowOnboarding) redirect("/onboarding");
  return user;
}

/** Admin area: super admin whose session was established with TOTP. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/");
  if (!user.mfa) redirect("/mfa");
  return user;
}
