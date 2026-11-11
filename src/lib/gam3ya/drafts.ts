import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import {
  contributionObligations,
  gam3yaMemberships,
  gam3yaOrganizers,
  gam3yas,
  membershipShares,
  payoutTurns,
  payouts,
  scheduleVersions,
} from "@/lib/db/schema";
import { generateSchedule, ScheduleValidationError } from "@/lib/engine/schedule";
import { validateAll, type ValidationIssue } from "@/lib/engine/validate";
import type { Gam3yaConfig, PayoutTurn, Schedule, ShareHolding } from "@/lib/engine/types";
import {
  draftBasicsSchema,
  draftFinancialsSchema,
  holdingSchema,
  turnSchema,
  type DraftBasics,
  type DraftFinancials,
  type HoldingInput,
  type TurnInput,
} from "@/lib/validation/gam3ya";
import { DomainError, toDomainError } from "./errors";

/**
 * Draft lifecycle (super admin only — enforced by RLS policies and the
 * app.activate_gam3ya() function, not just by this code).
 */

export async function createDraft(
  tx: Tx,
  actorId: string,
  basics: DraftBasics,
  financials: DraftFinancials,
): Promise<string> {
  const b = draftBasicsSchema.parse(basics);
  const f = draftFinancialsSchema.parse(financials);
  try {
    const [row] = await tx
      .insert(gam3yas)
      .values({
        name: b.name,
        description: b.description ?? null,
        totalShares: f.totalShares,
        contributionPerShare: f.contributionPerShare,
        frequency: f.frequency,
        startDate: f.startDate,
        dueDay: f.dueDay,
        payoutOffsetDays: f.payoutOffsetDays,
        graceDays: f.graceDays,
        allowSelfReport: f.allowSelfReport,
        createdBy: actorId,
      })
      .returning({ id: gam3yas.id });
    const id = row!.id;
    await tx.insert(scheduleVersions).values({ gam3yaId: id, version: 1, reason: "initial", createdBy: actorId });
    await tx
      .insert(gam3yaOrganizers)
      .values(b.organizerIds.map((userId) => ({ gam3yaId: id, userId, assignedBy: actorId })));
    return id;
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function updateDraft(
  tx: Tx,
  gam3yaId: string,
  actorId: string,
  basics: DraftBasics,
  financials: DraftFinancials,
): Promise<void> {
  const b = draftBasicsSchema.parse(basics);
  const f = draftFinancialsSchema.parse(financials);
  try {
    const updated = await tx
      .update(gam3yas)
      .set({
        name: b.name,
        description: b.description ?? null,
        totalShares: f.totalShares,
        contributionPerShare: f.contributionPerShare,
        frequency: f.frequency,
        startDate: f.startDate,
        dueDay: f.dueDay,
        payoutOffsetDays: f.payoutOffsetDays,
        graceDays: f.graceDays,
        allowSelfReport: f.allowSelfReport,
      })
      .where(and(eq(gam3yas.id, gam3yaId), eq(gam3yas.status, "draft")))
      .returning({ id: gam3yas.id });
    if (updated.length === 0) throw new DomainError("not_a_draft");
    await tx.delete(gam3yaOrganizers).where(eq(gam3yaOrganizers.gam3yaId, gam3yaId));
    await tx
      .insert(gam3yaOrganizers)
      .values(b.organizerIds.map((userId) => ({ gam3yaId, userId, assignedBy: actorId })));
  } catch (e) {
    throw toDomainError(e);
  }
}

/** Replaces all participants & share holdings of a draft in one go. */
export async function setDraftHoldings(tx: Tx, gam3yaId: string, holdings: HoldingInput[]): Promise<void> {
  const parsed = holdings.map((h) => holdingSchema.parse(h));
  try {
    await tx.delete(membershipShares).where(eq(membershipShares.gam3yaId, gam3yaId));
    await tx.delete(gam3yaMemberships).where(eq(gam3yaMemberships.gam3yaId, gam3yaId));
    const userIds = [...new Set(parsed.map((h) => h.userId))].sort();
    if (userIds.length === 0) return;
    const memberships = await tx
      .insert(gam3yaMemberships)
      .values(userIds.map((userId) => ({ gam3yaId, userId })))
      .returning({ id: gam3yaMemberships.id, userId: gam3yaMemberships.userId });
    const byUser = new Map(memberships.map((m) => [m.userId, m.id]));
    await tx.insert(membershipShares).values(
      parsed.map((h) => ({
        gam3yaId,
        shareNumber: h.shareNumber,
        membershipId: byUser.get(h.userId)!,
        portionBp: h.portionBp,
      })),
    );
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function setDraftTurns(tx: Tx, gam3yaId: string, turns: TurnInput[]): Promise<void> {
  const parsed = turns.map((t) => turnSchema.parse(t));
  try {
    await tx.delete(payoutTurns).where(and(eq(payoutTurns.gam3yaId, gam3yaId), eq(payoutTurns.scheduleVersion, 1)));
    if (parsed.length === 0) return;
    await tx.insert(payoutTurns).values(parsed.map((t) => ({ gam3yaId, scheduleVersion: 1, ...t })));
  } catch (e) {
    throw toDomainError(e);
  }
}

export interface LoadedDraft {
  id: string;
  name: string;
  status: string;
  config: Gam3yaConfig;
  /** Holdings keyed by membership id (engine member ids). */
  holdings: ShareHolding[];
  turns: PayoutTurn[];
  memberUserIds: Map<string, string>; // membershipId → userId
}

export async function loadDraft(tx: Tx, gam3yaId: string): Promise<LoadedDraft> {
  const [g] = await tx.select().from(gam3yas).where(eq(gam3yas.id, gam3yaId));
  if (!g) throw new DomainError("not_found");
  const members = await tx
    .select({ id: gam3yaMemberships.id, userId: gam3yaMemberships.userId })
    .from(gam3yaMemberships)
    .where(eq(gam3yaMemberships.gam3yaId, gam3yaId));
  const shares = await tx
    .select()
    .from(membershipShares)
    .where(eq(membershipShares.gam3yaId, gam3yaId))
    .orderBy(asc(membershipShares.shareNumber));
  const turns = await tx
    .select({ shareNumber: payoutTurns.shareNumber, cycleNumber: payoutTurns.cycleNumber })
    .from(payoutTurns)
    .where(and(eq(payoutTurns.gam3yaId, gam3yaId), eq(payoutTurns.scheduleVersion, 1)));

  return {
    id: g.id,
    name: g.name,
    status: g.status,
    config: {
      totalShares: g.totalShares,
      contributionPerShare: g.contributionPerShare,
      frequency: g.frequency as Gam3yaConfig["frequency"],
      startDate: g.startDate,
      dueDay: g.dueDay,
      payoutOffsetDays: g.payoutOffsetDays,
      graceDays: g.graceDays,
    },
    holdings: shares.map((s) => ({ shareNumber: s.shareNumber, memberId: s.membershipId, portionBp: s.portionBp })),
    turns,
    memberUserIds: new Map(members.map((m) => [m.id, m.userId])),
  };
}

export function previewDraft(draft: LoadedDraft): { issues: ValidationIssue[]; schedule: Schedule | null } {
  const issues = validateAll(draft.config, draft.holdings, draft.turns);
  if (issues.length > 0) return { issues, schedule: null };
  return { issues, schedule: generateSchedule(draft.config, draft.holdings, draft.turns) };
}

/**
 * Generates the schedule with the tested engine, writes it, then asks the
 * database to re-verify everything and activate — all in the caller's
 * transaction, so any failure leaves the draft untouched.
 */
export async function activateDraft(tx: Tx, gam3yaId: string): Promise<void> {
  const draft = await loadDraft(tx, gam3yaId);
  if (draft.status !== "draft") throw new DomainError("not_a_draft");

  let schedule: Schedule;
  try {
    schedule = generateSchedule(draft.config, draft.holdings, draft.turns);
  } catch (e) {
    if (e instanceof ScheduleValidationError) throw new DomainError("schedule_invalid", e.issues);
    throw e;
  }

  try {
    await tx.insert(contributionObligations).values(
      schedule.obligations.map((o) => ({
        gam3yaId,
        scheduleVersion: 1,
        cycleNumber: o.cycleNumber,
        membershipId: o.memberId,
        dueDate: o.dueDate,
        amount: o.amount,
      })),
    );
    await tx.insert(payouts).values(
      schedule.payouts.map((p) => ({
        gam3yaId,
        scheduleVersion: 1,
        cycleNumber: p.cycleNumber,
        recipientShare: p.shareNumber,
        expectedAmount: p.amount,
        scheduledDate: p.payoutDate,
      })),
    );
    await tx.execute(sql`select app.activate_gam3ya(${gam3yaId}::uuid)`);
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function deleteDraft(tx: Tx, gam3yaId: string): Promise<void> {
  const res = await tx
    .delete(gam3yas)
    .where(and(eq(gam3yas.id, gam3yaId), eq(gam3yas.status, "draft")))
    .returning({ id: gam3yas.id });
  if (res.length === 0) throw new DomainError("not_a_draft");
}

export async function draftMemberUserIds(tx: Tx, gam3yaId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: gam3yaMemberships.userId })
    .from(gam3yaMemberships)
    .where(and(eq(gam3yaMemberships.gam3yaId, gam3yaId), inArray(gam3yaMemberships.status, ["active"])));
  return rows.map((r) => r.userId);
}
