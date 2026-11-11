import "server-only";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import {
  contributionObligations,
  contributionRecords,
  gam3yaMemberships,
  gam3yaOrganizers,
  gam3yas,
  membershipShares,
  notifications,
  payouts,
  profiles,
} from "@/lib/db/schema";
import { portionOf, type Piasters } from "@/lib/engine/money";
import type { MemberObligation, MemberPayout } from "@/lib/engine/summary";
import type { ContributionRecordStatus, PayoutRecordStatus } from "@/lib/engine/types";

/**
 * Read models. Every query runs inside an RLS-scoped transaction, so even a
 * mistaken filter here cannot return another member's private rows.
 */

export type Gam3yaRow = typeof gam3yas.$inferSelect;

export interface MyGam3ya {
  gam3ya: Gam3yaRow;
  membershipId: string | null;
  shares: { shareNumber: number; portionBp: number }[];
  isOrganizer: boolean;
}

export async function getMyGam3yas(tx: Tx, userId: string): Promise<MyGam3ya[]> {
  const memberRows = await tx
    .select({ g: gam3yas, membershipId: gam3yaMemberships.id })
    .from(gam3yaMemberships)
    .innerJoin(gam3yas, eq(gam3yas.id, gam3yaMemberships.gam3yaId))
    .where(and(eq(gam3yaMemberships.userId, userId), ne(gam3yas.status, "draft")));
  const orgRows = await tx
    .select({ g: gam3yas })
    .from(gam3yaOrganizers)
    .innerJoin(gam3yas, eq(gam3yas.id, gam3yaOrganizers.gam3yaId))
    .where(eq(gam3yaOrganizers.userId, userId));

  const membershipIds = memberRows.map((r) => r.membershipId);
  const shares = membershipIds.length
    ? await tx.select().from(membershipShares).where(inArray(membershipShares.membershipId, membershipIds))
    : [];

  const out = new Map<string, MyGam3ya>();
  for (const r of memberRows) {
    out.set(r.g.id, {
      gam3ya: r.g,
      membershipId: r.membershipId,
      shares: shares
        .filter((s) => s.membershipId === r.membershipId)
        .map((s) => ({ shareNumber: s.shareNumber, portionBp: s.portionBp }))
        .sort((a, b) => a.shareNumber - b.shareNumber),
      isOrganizer: false,
    });
  }
  for (const r of orgRows) {
    const existing = out.get(r.g.id);
    if (existing) existing.isOrganizer = true;
    else out.set(r.g.id, { gam3ya: r.g, membershipId: null, shares: [], isOrganizer: true });
  }
  return [...out.values()].sort((a, b) => a.gam3ya.name.localeCompare(b.gam3ya.name));
}

export interface ObligationView extends MemberObligation {
  id: string;
  gam3yaName: string;
  recordedPaymentDate: string | null;
  statusUpdatedAt: Date | null;
}

export async function getMyObligations(tx: Tx, userId: string, gam3yaId?: string): Promise<ObligationView[]> {
  const rows = await tx
    .select({ o: contributionObligations, name: gam3yas.name, grace: gam3yas.graceDays })
    .from(contributionObligations)
    .innerJoin(gam3yaMemberships, eq(gam3yaMemberships.id, contributionObligations.membershipId))
    .innerJoin(gam3yas, eq(gam3yas.id, contributionObligations.gam3yaId))
    .where(
      and(
        eq(gam3yaMemberships.userId, userId),
        ne(gam3yas.status, "draft"),
        gam3yaId ? eq(gam3yas.id, gam3yaId) : undefined,
      ),
    )
    .orderBy(contributionObligations.dueDate);
  return rows.map(({ o, name, grace }) => ({
    id: o.id,
    gam3yaId: o.gam3yaId,
    gam3yaName: name,
    cycleNumber: o.cycleNumber,
    dueDate: o.dueDate,
    amount: o.amount,
    record: o.recordStatus as ContributionRecordStatus | null,
    graceDays: grace,
    recordedPaymentDate: o.recordedPaymentDate,
    statusUpdatedAt: o.statusUpdatedAt,
  }));
}

export interface PayoutView extends MemberPayout {
  id: string;
  gam3yaName: string;
  shareNumber: number;
  portionBp: number;
  potAmount: Piasters;
}

/** The member's own expected payouts (their exact portion of each pot). */
export async function getMyPayouts(tx: Tx, userId: string, gam3yaId?: string): Promise<PayoutView[]> {
  const rows = await tx
    .select({ p: payouts, name: gam3yas.name, grace: gam3yas.graceDays, bp: membershipShares.portionBp })
    .from(payouts)
    .innerJoin(gam3yas, and(eq(gam3yas.id, payouts.gam3yaId), eq(gam3yas.currentScheduleVersion, payouts.scheduleVersion)))
    .innerJoin(
      membershipShares,
      and(eq(membershipShares.gam3yaId, payouts.gam3yaId), eq(membershipShares.shareNumber, payouts.recipientShare)),
    )
    .innerJoin(gam3yaMemberships, eq(gam3yaMemberships.id, membershipShares.membershipId))
    .where(and(eq(gam3yaMemberships.userId, userId), ne(gam3yas.status, "draft"), gam3yaId ? eq(gam3yas.id, gam3yaId) : undefined))
    .orderBy(payouts.scheduledDate);
  return rows.map(({ p, name, grace, bp }) => ({
    id: p.id,
    gam3yaId: p.gam3yaId,
    gam3yaName: name,
    cycleNumber: p.cycleNumber,
    shareNumber: p.recipientShare,
    portionBp: bp,
    potAmount: p.expectedAmount,
    payoutDate: p.scheduledDate,
    amount: portionOf(p.expectedAmount, bp),
    record: p.recordStatus as PayoutRecordStatus | null,
    graceDays: grace,
  }));
}

export interface TurnRow {
  cycle_number: number;
  share_number: number;
  scheduled_date: string;
  expected_amount: number;
  is_completed: boolean;
  holders: { display_name: string; portion_bp: number; is_me: boolean }[];
}

/** Full payout order for anyone in the Gam3ya — display names only (DB function). */
export async function getTurns(tx: Tx, gam3yaId: string): Promise<TurnRow[]> {
  const rows = (await tx.execute(sql`select * from app.gam3ya_turns(${gam3yaId}::uuid)`)) as unknown as TurnRow[];
  return rows.map((r) => ({ ...r, expected_amount: Number(r.expected_amount), scheduled_date: String(r.scheduled_date).slice(0, 10) }));
}

export async function getOrganizerNames(tx: Tx, gam3yaId: string): Promise<string[]> {
  const rows = (await tx.execute(sql`select display_name from app.gam3ya_organizer_names(${gam3yaId}::uuid)`)) as unknown as {
    display_name: string;
  }[];
  return rows.map((r) => r.display_name);
}

export async function getUnreadNotifications(tx: Tx, userId: string, limit = 5) {
  return tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getNotifications(tx: Tx, userId: string, limit = 50) {
  return tx.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

/** Recent status changes on the member's own contributions. */
export async function getRecentActivity(tx: Tx, userId: string, limit = 6) {
  return tx
    .select({
      id: contributionRecords.id,
      toStatus: contributionRecords.toStatus,
      createdAt: contributionRecords.createdAt,
      cycleNumber: contributionObligations.cycleNumber,
      gam3yaId: gam3yas.id,
      gam3yaName: gam3yas.name,
    })
    .from(contributionRecords)
    .innerJoin(contributionObligations, eq(contributionObligations.id, contributionRecords.obligationId))
    .innerJoin(gam3yaMemberships, eq(gam3yaMemberships.id, contributionObligations.membershipId))
    .innerJoin(gam3yas, eq(gam3yas.id, contributionObligations.gam3yaId))
    .where(eq(gam3yaMemberships.userId, userId))
    .orderBy(desc(contributionRecords.createdAt))
    .limit(limit);
}

// ─── Organizer views (RLS lets only organizers/admins of the Gam3ya see these) ──

export async function getManageData(tx: Tx, gam3yaId: string) {
  const [g] = await tx.select().from(gam3yas).where(eq(gam3yas.id, gam3yaId));
  if (!g) return null;
  const obligations = await tx
    .select({ o: contributionObligations, name: profiles.displayName, phone: profiles.phone, userId: profiles.id })
    .from(contributionObligations)
    .innerJoin(gam3yaMemberships, eq(gam3yaMemberships.id, contributionObligations.membershipId))
    .innerJoin(profiles, eq(profiles.id, gam3yaMemberships.userId))
    .where(eq(contributionObligations.gam3yaId, gam3yaId))
    .orderBy(contributionObligations.cycleNumber, profiles.displayName);
  const payoutRows = await tx
    .select()
    .from(payouts)
    .where(and(eq(payouts.gam3yaId, gam3yaId), eq(payouts.scheduleVersion, g.currentScheduleVersion)))
    .orderBy(payouts.cycleNumber);
  return { gam3ya: g, obligations, payouts: payoutRows };
}
