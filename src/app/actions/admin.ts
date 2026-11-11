"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { defineAction } from "@/lib/actions";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { DomainError } from "@/lib/gam3ya/errors";
import { reviewChangeRequest } from "@/lib/gam3ya/recording";
import { activateDraft, createDraft, deleteDraft, setDraftHoldings, setDraftTurns, updateDraft } from "@/lib/gam3ya/drafts";
import { draftBasicsSchema, draftFinancialsSchema, holdingSchema, turnSchema, uuidSchema } from "@/lib/validation/gam3ya";

const admin = { guard: "admin" as const };

/** Secure invitation: Supabase emails a one-time link; we never see or set passwords. */
export const inviteUserAction = defineAction(
  z.object({
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(80),
    role: z.enum(["member", "organizer", "super_admin"]),
    locale: z.enum(["ar", "en"]).default("ar"),
  }),
  async ({ tx, input }) => {
    const supa = createSupabaseAdmin();
    const { data, error } = await supa.auth.admin.inviteUserByEmail(input.email.toLowerCase(), {
      data: { display_name: input.displayName, locale: input.locale },
      redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/set-password`,
    });
    if (error || !data.user) throw new DomainError(error?.status === 422 ? "duplicate" : "unexpected_error");
    if (input.role !== "member") {
      await tx.execute(sql`select app.admin_set_user_role(${data.user.id}::uuid, ${input.role})`);
    }
    await tx.execute(sql`select app.admin_log('user.invited', 'profile', ${data.user.id}, ${input.role})`);
    revalidatePath("/admin/users");
    return { id: data.user.id };
  },
  { ...admin, name: "invite", limit: 30 },
);

export const setUserRoleAction = defineAction(
  z.object({ userId: uuidSchema, role: z.enum(["member", "organizer", "super_admin"]) }),
  async ({ tx, input }) => {
    await tx.execute(sql`select app.admin_set_user_role(${input.userId}::uuid, ${input.role})`);
    revalidatePath("/admin/users");
    return null;
  },
  { ...admin, name: "set-role" },
);

/** Deactivation keeps history, and also bans the auth user so sessions can't refresh. */
export const setUserActiveAction = defineAction(
  z.object({ userId: uuidSchema, active: z.boolean(), reason: z.string().trim().min(3).max(300) }),
  async ({ tx, input }) => {
    await tx.execute(sql`select app.admin_set_user_active(${input.userId}::uuid, ${input.active}, ${input.reason})`);
    const supa = createSupabaseAdmin();
    await supa.auth.admin.updateUserById(input.userId, { ban_duration: input.active ? "none" : "876000h" });
    revalidatePath("/admin/users");
    return null;
  },
  { ...admin, name: "set-active" },
);

export const saveDraftAction = defineAction(
  z.object({
    id: uuidSchema.nullable(),
    basics: draftBasicsSchema,
    financials: draftFinancialsSchema,
    holdings: z.array(holdingSchema).max(240),
    turns: z.array(turnSchema).max(120),
  }),
  async ({ tx, user, input }) => {
    const id = input.id ?? (await createDraft(tx, user.userId, input.basics, input.financials));
    if (input.id) await updateDraft(tx, id, user.userId, input.basics, input.financials);
    await setDraftHoldings(tx, id, input.holdings);
    await setDraftTurns(tx, id, input.turns);
    revalidatePath("/admin/gam3yas");
    return { id };
  },
  { ...admin, name: "save-draft", limit: 30 },
);

export const activateDraftAction = defineAction(
  uuidSchema,
  async ({ tx, input }) => {
    await activateDraft(tx, input);
    revalidatePath("/admin/gam3yas");
    revalidatePath("/");
    return { id: input };
  },
  { ...admin, name: "activate", limit: 10 },
);

export const deleteDraftAction = defineAction(
  uuidSchema,
  async ({ tx, input }) => {
    await deleteDraft(tx, input);
    revalidatePath("/admin/gam3yas");
    return null;
  },
  { ...admin, name: "delete-draft", limit: 10 },
);

export const reviewRequestAction = defineAction(
  z.object({ id: uuidSchema, approve: z.boolean(), note: z.string().trim().max(300).nullable() }),
  async ({ tx, input }) => {
    await reviewChangeRequest(tx, input.id, input.approve, input.note);
    revalidatePath("/admin/requests");
    return null;
  },
  { ...admin, name: "review-request" },
);

export const restoreGam3yaAction = defineAction(
  z.object({ id: uuidSchema, reason: z.string().trim().min(3).max(300) }),
  async ({ tx, input }) => {
    await tx.execute(sql`select app.restore_gam3ya(${input.id}::uuid, ${input.reason})`);
    revalidatePath("/admin/gam3yas");
    return null;
  },
  { ...admin, name: "restore" },
);

export const publishPolicyAction = defineAction(
  z.object({
    kind: z.enum(["terms", "privacy", "disclaimer", "subscription"]),
    version: z.string().trim().min(1).max(30),
    summary: z.string().trim().max(300).nullable(),
  }),
  async ({ tx, input }) => {
    const requires = input.kind === "terms" || input.kind === "privacy";
    await tx.execute(sql`select app.publish_policy(${input.kind}, ${input.version}, ${input.summary}, ${requires})`);
    revalidatePath("/admin/policies");
    return null;
  },
  { ...admin, name: "publish-policy", limit: 10 },
);
