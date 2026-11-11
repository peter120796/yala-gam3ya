import { z } from "zod";
import { isValidDate } from "@/lib/engine/dates";
import { LIMITS } from "@/lib/engine/validate";

/** Firebase Auth uids / Firestore document ids. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
/** @deprecated kept for older imports */
export const uuidSchema = idSchema;

export const civilDateSchema = z.string().refine(isValidDate, { message: "invalid_date" });

export const draftBasicsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  organizerIds: z.array(idSchema).min(1).max(5),
});

export const draftFinancialsSchema = z
  .object({
    contributionPerShare: z.number().int().positive().max(LIMITS.maxContributionPerShare),
    totalShares: z.number().int().min(LIMITS.minShares).max(LIMITS.maxShares),
    frequency: z.enum(["monthly", "biweekly", "weekly"]),
    startDate: civilDateSchema,
    dueDay: z.number().int().min(1).max(31).nullable(),
    payoutOffsetDays: z.number().int().min(0).max(27).default(0),
    graceDays: z.number().int().min(0).max(LIMITS.maxGraceDays).default(3),
    allowSelfReport: z.boolean().default(false),
  })
  .refine((v) => (v.frequency === "monthly" ? v.dueDay !== null : v.dueDay === null), {
    path: ["dueDay"],
    message: "due_day_frequency",
  })
  .refine((v) => v.payoutOffsetDays <= LIMITS.maxPayoutOffset[v.frequency], {
    path: ["payoutOffsetDays"],
    message: "payout_offset_too_large",
  });

export const holdingSchema = z.object({
  shareNumber: z.number().int().min(1).max(LIMITS.maxShares),
  userId: idSchema,
  portionBp: z.union([z.literal(5000), z.literal(10000)]),
});

export const turnSchema = z.object({
  shareNumber: z.number().int().min(1).max(LIMITS.maxShares),
  cycleNumber: z.number().int().min(1).max(LIMITS.maxShares),
});

export const contributionRecordSchema = z.object({
  obligationId: idSchema,
  status: z.enum(["reported_paid", "recorded_paid", "waived"]).nullable(),
  paymentDate: civilDateSchema.nullable().optional(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export const payoutRecordSchema = z.object({
  payoutId: idSchema,
  status: z.enum(["reported_completed", "confirmed_completed", "delayed"]).nullable(),
  completionDate: civilDateSchema.nullable().optional(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export type DraftBasics = z.infer<typeof draftBasicsSchema>;
export type DraftFinancials = z.infer<typeof draftFinancialsSchema>;
export type HoldingInput = z.infer<typeof holdingSchema>;
export type TurnInput = z.infer<typeof turnSchema>;
