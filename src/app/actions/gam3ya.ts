"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { contributionRecordSchema, payoutRecordSchema } from "@/lib/validation/gam3ya";
import { evaluateLifecycle, proposeSwap, recordContribution, recordPayout, setPaymentMethod } from "@/lib/data/gam3yas";

const docId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export const recordContributionAction = defineAction(
  z.object({ gam3yaId: docId, ...contributionRecordSchema.omit({ obligationId: true }).shape, obligationId: docId }),
  async ({ user, input }) => {
    await recordContribution(user.actor, input.gam3yaId, input.obligationId, { status: input.status, paymentDate: input.paymentDate, reason: input.reason });
    revalidatePath(`/gam3yas/${input.gam3yaId}`);
    revalidatePath("/");
    return null;
  },
  { name: "record-contribution", limit: 120 },
);

export const recordPayoutAction = defineAction(
  z.object({ gam3yaId: docId, ...payoutRecordSchema.omit({ payoutId: true }).shape, payoutId: docId }),
  async ({ user, input }) => {
    await recordPayout(user.actor, input.gam3yaId, input.payoutId, { status: input.status, completionDate: input.completionDate, reason: input.reason });
    revalidatePath(`/gam3yas/${input.gam3yaId}`);
    revalidatePath("/");
    return null;
  },
  { name: "record-payout", limit: 60 },
);

export const proposeSwapAction = defineAction(
  z.object({ gam3yaId: docId, shareA: z.number().int().min(1).max(120), shareB: z.number().int().min(1).max(120), reason: z.string().trim().min(3).max(300) }),
  async ({ user, input }) => {
    await proposeSwap(user.actor, input.gam3yaId, input.shareA, input.shareB, input.reason);
    revalidatePath(`/gam3yas/${input.gam3yaId}`);
    return null;
  },
  { name: "propose-swap", limit: 10 },
);

export const evaluateLifecycleAction = defineAction(
  docId,
  async ({ user, input }) => {
    const status = await evaluateLifecycle(user.actor, input);
    revalidatePath(`/gam3yas/${input}`);
    return status;
  },
  { name: "evaluate", limit: 20 },
);


/** "How I'll pay" — the member's own note for one Gam3ya (empty clears it). */
export const setPaymentMethodAction = defineAction(
  z.object({ gam3yaId: docId, text: z.string().max(400) }),
  async ({ user, input }) => {
    const text = await setPaymentMethod(user.actor, input.gam3yaId, input.text);
    revalidatePath(`/gam3yas/${input.gam3yaId}`);
    return { text };
  },
  { name: "set-payment-method", limit: 30 },
);
