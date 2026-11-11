"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { defineAction } from "@/lib/actions";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getSession, asUser } from "@/lib/auth/session";
import { notificationPreferences, notifications, policyAcceptances, policyVersions, profiles, userPreferences } from "@/lib/db/schema";

/** Language works signed in or out; when signed in it's saved to the profile. */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await getSession();
  if (session) {
    await asUser(session, (tx) => tx.update(userPreferences).set({ locale }).where(eq(userPreferences.userId, session.userId)));
  }
  revalidatePath("/", "layout");
}

export const setThemeAction = defineAction(
  z.enum(["light", "dark", "system"]),
  async ({ tx, user, input }) => {
    await tx.update(userPreferences).set({ theme: input }).where(eq(userPreferences.userId, user.userId));
    return null;
  },
  { name: "theme" },
);

export const setPrivacyModeAction = defineAction(
  z.boolean(),
  async ({ tx, user, input }) => {
    await tx.update(userPreferences).set({ privacyMode: input }).where(eq(userPreferences.userId, user.userId));
    return null;
  },
  { name: "privacy" },
);

const egyptPhone = /^(\+?20|0)?1[0125]\d{8}$/;

export const updateProfileAction = defineAction(
  z.object({
    displayName: z.string().trim().min(1).max(80),
    phone: z
      .string()
      .trim()
      .max(20)
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => v === "" || egyptPhone.test(v), "invalid_phone"),
  }),
  async ({ tx, user, input }) => {
    await tx
      .update(profiles)
      .set({ displayName: input.displayName, phone: input.phone || null })
      .where(eq(profiles.id, user.userId));
    revalidatePath("/", "layout");
    return null;
  },
  { name: "profile", limit: 20 },
);

export const updateNotificationPrefsAction = defineAction(
  z.object({
    emailEnabled: z.boolean(),
    contributionReminders: z.boolean(),
    payoutReminders: z.boolean(),
    gam3yaUpdates: z.boolean(),
  }),
  async ({ tx, user, input }) => {
    await tx
      .insert(notificationPreferences)
      .values({ userId: user.userId, ...input })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: input });
    return null;
  },
  { name: "notif-prefs", limit: 20 },
);

export const markNotificationsReadAction = defineAction(
  z.array(z.uuid()).max(200).optional(),
  async ({ tx, user, input }) => {
    const where = input?.length
      ? and(eq(notifications.userId, user.userId), inArray(notifications.id, input))
      : and(eq(notifications.userId, user.userId), isNull(notifications.readAt));
    await tx.update(notifications).set({ readAt: new Date() }).where(where);
    revalidatePath("/", "layout");
    return null;
  },
  { name: "notif-read" },
);

/** Records acceptance of the current Terms & Privacy versions (version + timestamp). */
export const acceptPoliciesAction = defineAction(
  z.object({ terms: z.literal(true), privacy: z.literal(true) }),
  async ({ tx, user }) => {
    const current = await tx
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(and(eq(policyVersions.isCurrent, true), inArray(policyVersions.kind, ["terms", "privacy"])));
    if (current.length < 2) throw new Error("policies missing");
    await tx
      .insert(policyAcceptances)
      .values(current.map((c) => ({ userId: user.userId, policyVersionId: c.id, locale: user.locale })))
      .onConflictDoNothing();
    await tx.execute(sql`select app.mark_onboarded()`);
    return null;
  },
  { name: "accept-policies", limit: 10 },
);
