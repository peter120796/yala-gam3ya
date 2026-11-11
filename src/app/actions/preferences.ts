"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { isLocale } from "@/i18n/config";
import { cookieOptions, decodeSessionCookie, encodeSessionCookie, ONE_YEAR, SESSION_COOKIE } from "@/lib/auth/cookie";
import { currentPolicies, getSession } from "@/lib/auth/session";
import { acceptPolicies, updateOwnPreferences, updateOwnProfile } from "@/lib/data/users";
import { markNotificationsRead } from "@/lib/data/reads";

/** Language works signed in or out; it lives in the single __session cookie. */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  const current = decodeSessionCookie(store.get(SESSION_COOKIE)?.value);
  store.set(SESSION_COOKIE, encodeSessionCookie({ ...current, l: locale }), cookieOptions(ONE_YEAR));
  const session = await getSession();
  if (session) await updateOwnPreferences(session.userId, { locale });
  revalidatePath("/", "layout");
}

export const setThemeAction = defineAction(
  z.enum(["light", "dark", "system"]),
  async ({ user, input }) => {
    await updateOwnPreferences(user.userId, { theme: input });
    return null;
  },
  { name: "theme" },
);

export const setPrivacyModeAction = defineAction(
  z.boolean(),
  async ({ user, input }) => {
    await updateOwnPreferences(user.userId, { privacyMode: input });
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
  async ({ user, input }) => {
    await updateOwnProfile(user.actor, { displayName: input.displayName, phone: input.phone || null });
    revalidatePath("/", "layout");
    return null;
  },
  { name: "profile", limit: 20 },
);

export const updateNotificationPrefsAction = defineAction(
  z.object({ emailEnabled: z.boolean(), contributionReminders: z.boolean(), payoutReminders: z.boolean(), gam3yaUpdates: z.boolean() }),
  async ({ user, input }) => {
    await updateOwnPreferences(user.userId, { notificationPrefs: input });
    return null;
  },
  { name: "notif-prefs", limit: 20 },
);

export const markNotificationsReadAction = defineAction(
  z.array(z.string().regex(/^[a-f0-9]{40}$/)).max(200).optional(),
  async ({ user, input }) => {
    await markNotificationsRead(user.actor, input);
    revalidatePath("/", "layout");
    return null;
  },
  { name: "notif-read" },
);

/**
 * Records acceptance of the current Terms & Privacy (version + timestamp).
 * Allowed before approval, so it uses the session directly.
 */
export async function acceptPoliciesAction(input: { terms: true; privacy: true }) {
  if (input?.terms !== true || input?.privacy !== true) return { ok: false as const, error: "validation" };
  const session = await getSession();
  if (!session) return { ok: false as const, error: "not_authorized" };
  const current = (await currentPolicies()).filter((p) => p.doc.requiresAcceptance).map((p) => ({ id: p.id, kind: p.doc.kind }));
  if (current.length < 2) return { ok: false as const, error: "invalid_operation" };
  const locale = decodeSessionCookie((await cookies()).get(SESSION_COOKIE)?.value).l ?? "ar";
  await acceptPolicies(session.userId, current, locale);
  return { ok: true as const, data: null };
}
