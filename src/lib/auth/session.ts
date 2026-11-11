import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getDb, runAsUser, type RlsClaims, type Tx } from "@/lib/db/client";
import { gam3yaOrganizers, notificationPreferences, policyAcceptances, policyVersions, profiles, userPreferences } from "@/lib/db/schema";

export interface Session {
  userId: string;
  aal: "aal1" | "aal2";
  email: string | null;
}

export interface CurrentUser extends Session {
  displayName: string;
  phone: string | null;
  role: "super_admin" | "organizer" | "member";
  isActive: boolean;
  locale: "ar" | "en";
  theme: "light" | "dark" | "system";
  privacyMode: boolean;
  needsOnboarding: boolean;
  organizesAny: boolean;
}

/** Verified session from the Supabase JWT (signature checked by getClaims). */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; aal?: string; email?: string };
  return { userId: c.sub, aal: c.aal === "aal2" ? "aal2" : "aal1", email: c.email ?? null };
});

export function claimsOf(session: Session): RlsClaims {
  return { sub: session.userId, aal: session.aal };
}

/** Runs DB work as the signed-in user with RLS enforced. */
export async function asUser<T>(session: Session, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsUser(getDb(), claimsOf(session), fn);
}

const REQUIRED_POLICIES = ["terms", "privacy"] as const;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  return asUser(session, async (tx) => {
    const [p] = await tx.select().from(profiles).where(eq(profiles.id, session.userId));
    if (!p) return null;
    let [pref] = await tx.select().from(userPreferences).where(eq(userPreferences.userId, session.userId));
    if (!pref) {
      [pref] = await tx.insert(userPreferences).values({ userId: session.userId }).returning();
      await tx.insert(notificationPreferences).values({ userId: session.userId }).onConflictDoNothing();
    }
    const current = await tx
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(and(eq(policyVersions.isCurrent, true), inArray(policyVersions.kind, [...REQUIRED_POLICIES])));
    const accepted = current.length
      ? await tx
          .select({ id: policyAcceptances.policyVersionId })
          .from(policyAcceptances)
          .where(
            and(
              eq(policyAcceptances.userId, session.userId),
              inArray(
                policyAcceptances.policyVersionId,
                current.map((c) => c.id),
              ),
            ),
          )
      : [];
    const organizes = await tx
      .select({ id: gam3yaOrganizers.gam3yaId })
      .from(gam3yaOrganizers)
      .where(eq(gam3yaOrganizers.userId, session.userId))
      .limit(1);
    return {
      ...session,
      displayName: p.displayName,
      phone: p.phone,
      role: p.platformRole as CurrentUser["role"],
      isActive: p.isActive,
      locale: (pref!.locale as CurrentUser["locale"]) ?? "ar",
      theme: (pref!.theme as CurrentUser["theme"]) ?? "system",
      privacyMode: pref!.privacyMode,
      needsOnboarding: accepted.length < current.length || current.length < REQUIRED_POLICIES.length,
      organizesAny: organizes.length > 0,
    };
  });
});

/** Page guard: signed in, active, onboarded. */
export async function requireUser(opts: { allowOnboarding?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/auth/signout?reason=deactivated");
  if (user.needsOnboarding && !opts.allowOnboarding) redirect("/onboarding");
  return user;
}

/** Page guard for the admin area: super admin with an MFA-verified session. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/");
  if (user.aal !== "aal2") redirect("/mfa?next=/admin");
  return user;
}
