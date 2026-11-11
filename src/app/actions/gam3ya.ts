"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/actions";
import { contributionRecordSchema, payoutRecordSchema, uuidSchema } from "@/lib/validation/gam3ya";
import { evaluateLifecycle, proposeTurnSwap, recordContribution, recordPayout } from "@/lib/gam3ya/recording";

const withGam3ya = <S extends z.ZodRawShape>(shape: S) => z.object({ gam3yaId: uuidSchema, ...shape });

export const recordContributionAction = defineAction(
  withGam3ya(contributionRecordSchema.shape),
  async ({ tx, input }) => {
    const { gam3yaId, ...rest } = input;
    await recordContribution(tx, rest);
    revalidatePath(`/gam3yas/${gam3yaId}`);
    revalidatePath("/");
    return null;
  },
  { name: "record-contribution", limit: 120 },
);

export const recordPayoutAction = defineAction(
  withGam3ya(payoutRecordSchema.shape),
  async ({ tx, input }) => {
    const { gam3yaId, ...rest } = input;
    await recordPayout(tx, rest);
    revalidatePath(`/gam3yas/${gam3yaId}`);
    revalidatePath("/");
    return null;
  },
  { name: "record-payout", limit: 60 },
);

export const proposeSwapAction = defineAction(
  z.object({
    gam3yaId: uuidSchema,
    shareA: z.number().int().min(1).max(120),
    shareB: z.number().int().min(1).max(120),
    reason: z.string().trim().min(3).max(300),
  }),
  async ({ tx, input }) => {
    await proposeTurnSwap(tx, input.gam3yaId, input.shareA, input.shareB, input.reason);
    revalidatePath(`/gam3yas/${input.gam3yaId}`);
    return null;
  },
  { name: "propose-swap", limit: 10 },
);

export const evaluateLifecycleAction = defineAction(
  uuidSchema,
  async ({ tx, input }) => {
    const status = await evaluateLifecycle(tx, input);
    revalidatePath(`/gam3yas/${input}`);
    return status;
  },
  { name: "evaluate", limit: 20 },
);
