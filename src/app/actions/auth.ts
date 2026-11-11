"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getDb, runAsUser } from "@/lib/db/client";
import { profiles, userPreferences } from "@/lib/db/schema";
import { LOCALE_COOKIE } from "@/i18n/config";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

export type FormState = { error?: string; message?: string } | null;

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(next: unknown, fallback = "/"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

async function clientKey(prefix: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${prefix}:${ip}`;
}

const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalidCredentials" };
  if (!rateLimit(await clientKey("login"), 10)) return { error: "rateLimited" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: error?.status === 429 ? "rateLimited" : "invalidCredentials" };
  }

  // Apply the saved language and check the account is active / needs MFA.
  const claims = { sub: data.user.id, aal: "aal1" as const };
  const info = await runAsUser(getDb(), claims, async (tx) => {
    const [p] = await tx.select({ active: profiles.isActive, role: profiles.platformRole }).from(profiles).where(eq(profiles.id, data.user.id));
    const [pref] = await tx.select({ locale: userPreferences.locale }).from(userPreferences).where(eq(userPreferences.userId, data.user.id));
    return { active: p?.active ?? false, role: p?.role, locale: pref?.locale ?? "ar" };
  });
  if (!info.active) {
    await supabase.auth.signOut();
    return { error: "accountDeactivated" };
  }
  (await cookies()).set(LOCALE_COOKIE, info.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  const next = safeNext(form.get("next"));
  if (info.role === "super_admin") redirect(`/mfa?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function requestPasswordResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = z.email().max(254).safeParse(form.get("email"));
  if (email.success && rateLimit(await clientKey("reset"), 5)) {
    const supabase = await createSupabaseServer();
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/set-password`,
    });
  }
  // Same answer whether or not the email exists (no account enumeration).
  return { message: "linkSent" };
}

const passwordSchema = z
  .string()
  .min(10)
  .max(200)
  .regex(/[A-Za-z؀-ۿ]/)
  .regex(/\d/);

export async function setPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const password = form.get("password");
  if (password !== form.get("confirm")) return { error: "passwordsMismatch" };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: "passwordRules" };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.status === 429 ? "rateLimited" : "linkInvalid" };
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
