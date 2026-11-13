"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { publicEnv } from "@/lib/env";
import { approvalIds } from "@/lib/admin/queries";
import { activateDraft, deleteDraft, restoreGam3ya, reviewChangeRequest, saveDraft } from "@/lib/data/gam3yas";
import { createGuest, inviteUser, setApproval, setUserActive, setUserRole } from "@/lib/data/users";
import { publishPolicy } from "@/lib/data/policies";
import { getEmailProvider } from "@/lib/notifications/provider";
import { renderInvite } from "@/lib/notifications/render";
import { draftBasicsSchema, draftFinancialsSchema, holdingSchema, turnSchema } from "@/lib/validation/gam3ya";

const admin = { guard: "admin" as const };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/**
 * Invitation: Firebase creates the account; we return a one-time
 * "set password" link. It's emailed when email is enabled, and shown to the
 * admin so it can also be shared directly (e.g. WhatsApp).
 */
export const inviteUserAction = defineAction(
  z.object({
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(80),
    role: z.enum(["member", "organizer", "super_admin"]),
    locale: z.enum(["ar", "en"]).default("ar"),
  }),
  async ({ user, input }) => {
    const { uid, link } = await inviteUser(user.actor, input, `${publicEnv.siteUrl}/login`);
    const mail = renderInvite(input.locale, input.displayName, link);
    const sent = await getEmailProvider().send({ to: input.email, ...mail });
    revalidatePath("/admin/users");
    return { id: uid, link, emailed: sent.ok && getEmailProvider().name !== "console" };
  },
  { ...admin, name: "invite", limit: 30 },
);

/** Add a person by name only (no account) so they can hold shares. */
export const createGuestAction = defineAction(
  z.object({ displayName: z.string().trim().min(2).max(80) }),
  async ({ user, input }) => {
    const guest = await createGuest(user.actor, input.displayName);
    revalidatePath("/admin/users");
    return guest;
  },
  { ...admin, name: "create-guest" },
);

export const setUserRoleAction = defineAction(
  z.object({ userId: id, role: z.enum(["member", "organizer", "super_admin"]) }),
  async ({ user, input }) => {
    await setUserRole(user.actor, input.userId, input.role);
    revalidatePath("/admin/users");
    return null;
  },
  { ...admin, name: "set-role" },
);

export const setUserActiveAction = defineAction(
  z.object({ userId: id, active: z.boolean(), reason: z.string().trim().min(3).max(300) }),
  async ({ user, input }) => {
    await setUserActive(user.actor, input.userId, input.active, input.reason);
    revalidatePath("/admin/users");
    return null;
  },
  { ...admin, name: "set-active" },
);

export const setApprovalAction = defineAction(
  z
    .object({
      decision: z.enum(["approved", "rejected", "pending"]),
      ids: z.array(id).max(5000).optional(),
      allMatching: z.object({ status: z.enum(["pending", "approved", "rejected"]), q: z.string().trim().max(80).nullable() }).optional(),
      reason: z.string().trim().max(300).nullable(),
    })
    .refine((v) => (v.ids?.length ?? 0) > 0 || v.allMatching, "nothing_selected"),
  async ({ user, input }) => {
    const ids = input.allMatching ? await approvalIds(user.actor, input.allMatching.status, input.allMatching.q || null) : input.ids!;
    const count = await setApproval(user.actor, ids, input.decision, input.reason);
    revalidatePath("/admin/approvals");
    revalidatePath("/admin");
    return { count };
  },
  { ...admin, name: "approvals", limit: 30 },
);

export const saveDraftAction = defineAction(
  z.object({
    id: id.nullable(),
    basics: draftBasicsSchema,
    financials: draftFinancialsSchema,
    holdings: z.array(holdingSchema).max(240),
    turns: z.array(turnSchema).max(120),
  }),
  async ({ user, input }) => {
    const gid = await saveDraft(user.actor, input);
    revalidatePath("/admin/gam3yas");
    return { id: gid };
  },
  { ...admin, name: "save-draft", limit: 30 },
);

export const activateDraftAction = defineAction(
  id,
  async ({ user, input }) => {
    await activateDraft(user.actor, input);
    revalidatePath("/admin/gam3yas");
    revalidatePath("/");
    return { id: input };
  },
  { ...admin, name: "activate", limit: 10 },
);

export const deleteDraftAction = defineAction(
  id,
  async ({ user, input }) => {
    await deleteDraft(user.actor, input);
    revalidatePath("/admin/gam3yas");
    return null;
  },
  { ...admin, name: "delete-draft", limit: 10 },
);

export const reviewRequestAction = defineAction(
  z.object({ gam3yaId: id, id, approve: z.boolean(), note: z.string().trim().max(300).nullable() }),
  async ({ user, input }) => {
    await reviewChangeRequest(user.actor, input.gam3yaId, input.id, input.approve, input.note);
    revalidatePath("/admin/requests");
    return null;
  },
  { ...admin, name: "review-request" },
);

export const restoreGam3yaAction = defineAction(
  z.object({ id, reason: z.string().trim().min(3).max(300) }),
  async ({ user, input }) => {
    await restoreGam3ya(user.actor, input.id, input.reason);
    revalidatePath("/admin/gam3yas");
    return null;
  },
  { ...admin, name: "restore" },
);

export const publishPolicyAction = defineAction(
  z.object({
    kind: z.enum(["terms", "privacy", "disclaimer", "subscription"]),
    version: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9._-]+$/),
    summary: z.string().trim().max(300).nullable(),
  }),
  async ({ user, input }) => {
    await publishPolicy(user.actor, input.kind, input.version, input.summary);
    revalidatePath("/admin/policies");
    return null;
  },
  { ...admin, name: "publish-policy", limit: 10 },
);
