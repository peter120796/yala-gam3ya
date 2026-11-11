import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { compareDates, todayIn } from "@/lib/engine/dates";
import { portionOf } from "@/lib/engine/money";
import { generateSchedule, ScheduleValidationError } from "@/lib/engine/schedule";
import { isContributionSettled, isPayoutSettled } from "@/lib/engine/status";
import type { Gam3yaConfig, Gam3yaLifecycle } from "@/lib/engine/types";
import { DomainError } from "@/lib/gam3ya/errors";
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
import {
  applySwap,
  assertParticipantsApproved,
  assertSuperAdmin,
  canManage,
  decideContributionRecord,
  decidePayoutRecord,
  decideProposeSwap,
  PolicyError,
  shareHolders,
  type Actor,
  type ContributionChange,
  type PayoutChange,
} from "./policy";
import { audit, bulk, notificationDoc, nowIso, obligationId, payoutId, readNotificationState, record, refs } from "./store";
import type { ChangeRequestDoc, Gam3yaDoc, ObligationDoc, PayoutDoc } from "./types";
import { usersByIds } from "./users";

export const configOf = (g: Gam3yaDoc): Gam3yaConfig => ({
  totalShares: g.totalShares,
  contributionPerShare: g.contributionPerShare,
  frequency: g.frequency,
  startDate: g.startDate,
  dueDay: g.dueDay,
  payoutOffsetDays: g.payoutOffsetDays,
  graceDays: g.graceDays,
});

/** Completion never happens just because time passed — only when everything is settled. */
export function nextLifecycle(g: Pick<Gam3yaDoc, "status" | "openObligations" | "openPayouts" | "endDate">, today: string): Gam3yaLifecycle {
  if (g.status !== "active" && g.status !== "needs_closure") return g.status;
  if (g.openObligations === 0 && g.openPayouts === 0) return "completed";
  if (g.endDate && compareDates(today, g.endDate) > 0) return "needs_closure";
  return "active";
}

async function loadGam3ya(tx: Transaction, gid: string) {
  const snap = await tx.get(refs.gam3ya(gid));
  if (!snap.exists) throw new PolicyError("not_found");
  return snap.data() as Gam3yaDoc;
}

/** Lifecycle transition + completion notifications (reads must already be done). */
function applyLifecycle(tx: Transaction, gid: string, g: Gam3yaDoc, next: Gam3yaLifecycle, existingNotes: Set<string>, actorId: string | null) {
  if (next === g.status) return {};
  const now = nowIso();
  const patch: Partial<Gam3yaDoc> = { status: next, completedAt: next === "completed" ? now : null, archivedAt: next === "completed" ? now : null };
  audit(tx, { actorId, action: `gam3ya.${next}`, entityType: "gam3ya", entityId: gid, gam3yaId: gid, before: { status: g.status }, after: { status: next }, reason: null });
  if (next === "completed") {
    for (const uid of g.memberIds) {
      const key = `gam3ya_completed:${gid}:${uid}`;
      if (!existingNotes.has(key)) tx.create(refs.notification(key), notificationDoc({ userId: uid, kind: "gam3ya_completed", gam3yaId: gid, params: { gam3ya: g.name }, dedupeKey: key }));
    }
  }
  return patch;
}
const completionKeys = (gid: string, g: Gam3yaDoc) => g.memberIds.map((uid) => `gam3ya_completed:${gid}:${uid}`);

// ─────────────────────────────── Drafts ───────────────────────────────

export interface DraftInput {
  id: string | null;
  basics: DraftBasics;
  financials: DraftFinancials;
  holdings: HoldingInput[];
  turns: TurnInput[];
}

export async function saveDraft(actor: Actor | null, input: DraftInput): Promise<string> {
  assertSuperAdmin(actor);
  const b = draftBasicsSchema.parse(input.basics);
  const f = draftFinancialsSchema.parse(input.financials);
  const holdings = input.holdings.map((h) => holdingSchema.parse(h));
  const turns = input.turns.map((t) => turnSchema.parse(t));

  const people = await usersByIds([...b.organizerIds, ...holdings.map((h) => h.userId)]);
  const ids = [...new Set([...b.organizerIds, ...holdings.map((h) => h.userId)])];
  if (ids.some((id) => !people.has(id))) throw new PolicyError("invalid_reference");
  assertParticipantsApproved(ids.map((id) => ({ uid: id, ...people.get(id)! })));

  const turnOrder = Array.from({ length: f.totalShares }, (_, i) => turns.find((t) => t.cycleNumber === i + 1)?.shareNumber ?? 0);
  const fields = {
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
    organizerIds: [...new Set(b.organizerIds)],
    memberIds: [...new Set(holdings.map((h) => h.userId))].sort(),
    holdings: holdings.map((h) => ({ shareNumber: h.shareNumber, userId: h.userId, portionBp: h.portionBp })),
    turnOrder,
    updatedAt: nowIso(),
  };

  return db().runTransaction(async (tx) => {
    if (input.id) {
      const g = await loadGam3ya(tx, input.id);
      if (g.status !== "draft") throw new PolicyError("not_a_draft");
      tx.update(refs.gam3ya(input.id), fields);
      audit(tx, { actorId: actor.uid, action: "gam3ya.draft_updated", entityType: "gam3ya", entityId: input.id, gam3yaId: input.id, before: null, after: { name: b.name }, reason: null });
      return input.id;
    }
    const ref = refs.gam3yas().doc();
    const doc: Gam3yaDoc = {
      ...fields,
      status: "draft",
      timezone: "Africa/Cairo",
      currency: "EGP",
      currentScheduleVersion: 1,
      openObligations: 0,
      openPayouts: 0,
      endDate: null,
      activatedAt: null,
      activatedBy: null,
      completedAt: null,
      archivedAt: null,
      createdBy: actor.uid,
      createdAt: nowIso(),
    };
    tx.create(ref, doc);
    audit(tx, { actorId: actor.uid, action: "gam3ya.draft_created", entityType: "gam3ya", entityId: ref.id, gam3yaId: ref.id, before: null, after: { name: b.name }, reason: null });
    return ref.id;
  });
}

async function clearSchedule(gid: string) {
  const w = bulk();
  for (const q of [refs.obligations(gid), refs.payouts(gid)]) {
    const snap = await q.get();
    for (const d of snap.docs) void w.delete(d.ref);
  }
  await w.close();
}

export async function deleteDraft(actor: Actor | null, gid: string) {
  assertSuperAdmin(actor);
  const snap = await refs.gam3ya(gid).get();
  if (!snap.exists || snap.data()!.status !== "draft") throw new PolicyError("not_a_draft");
  await clearSchedule(gid);
  await db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    if (g.status !== "draft") throw new PolicyError("not_a_draft");
    tx.delete(refs.gam3ya(gid));
    audit(tx, { actorId: actor.uid, action: "gam3ya.draft_deleted", entityType: "gam3ya", entityId: gid, gam3yaId: null, before: { name: g.name }, after: null, reason: null });
  });
}

/**
 * Activation: the tested engine generates the schedule; documents are written
 * while the Gam3ya is still a (member-invisible) draft; then one transaction
 * re-checks the draft is unchanged and flips it to active.
 */
export async function activateDraft(actor: Actor | null, gid: string) {
  assertSuperAdmin(actor);
  const snap = await refs.gam3ya(gid).get();
  if (!snap.exists) throw new PolicyError("not_found");
  const g = snap.data()!;
  if (g.status !== "draft") throw new PolicyError("not_a_draft");
  if (!g.organizerIds.length) throw new PolicyError("activation_no_organizer");
  const people = await usersByIds([...g.organizerIds, ...g.memberIds]);
  assertParticipantsApproved([...g.organizerIds, ...g.memberIds].map((id) => ({ uid: id, isActive: people.get(id)?.isActive ?? false, approvalStatus: people.get(id)?.approvalStatus ?? "pending" })));

  const turns = g.turnOrder.map((share, i) => ({ shareNumber: share, cycleNumber: i + 1 })).filter((t) => t.shareNumber > 0);
  let schedule;
  try {
    schedule = generateSchedule(configOf(g), g.holdings.map((h) => ({ shareNumber: h.shareNumber, memberId: h.userId, portionBp: h.portionBp })), turns);
  } catch (e) {
    if (e instanceof ScheduleValidationError) throw new DomainError("schedule_invalid", e.issues);
    throw e;
  }

  await clearSchedule(gid);
  const w = bulk();
  for (const o of schedule.obligations) {
    const doc: ObligationDoc = {
      gam3yaId: gid, gam3yaName: g.name, scheduleVersion: 1, cycleNumber: o.cycleNumber, userId: o.memberId, dueDate: o.dueDate,
      amount: o.amount, graceDays: g.graceDays, shares: o.shares, recordStatus: null, recordedPaymentDate: null, recordedBy: null, statusReason: null, statusUpdatedAt: null,
    };
    void w.create(refs.obligation(gid, obligationId(1, o.cycleNumber, o.memberId)), doc);
  }
  for (const p of schedule.payouts) {
    const doc: PayoutDoc = {
      gam3yaId: gid, gam3yaName: g.name, scheduleVersion: 1, isCurrent: true, cycleNumber: p.cycleNumber, recipientShare: p.shareNumber, expectedAmount: p.amount,
      scheduledDate: p.payoutDate, graceDays: g.graceDays, recipients: p.recipients.map((r) => ({ userId: r.memberId, portionBp: r.portionBp, amount: r.amount })),
      recipientIds: p.recipients.map((r) => r.memberId), recordStatus: null, recordedCompletionDate: null, recordedBy: null, statusReason: null, statusUpdatedAt: null,
    };
    void w.create(refs.payout(gid, payoutId(1, p.cycleNumber)), doc);
  }
  await w.close();

  const [oc, pc] = await Promise.all([refs.obligations(gid).count().get(), refs.payouts(gid).count().get()]);
  if (oc.data().count !== schedule.obligations.length || pc.data().count !== schedule.payouts.length) {
    throw new PolicyError("activation_obligations_invalid");
  }

  await db().runTransaction(async (tx) => {
    const cur = await loadGam3ya(tx, gid);
    if (cur.status !== "draft" || cur.updatedAt !== g.updatedAt) throw new PolicyError("invalid_operation");
    tx.update(refs.gam3ya(gid), {
      status: "active",
      currentScheduleVersion: 1,
      openObligations: schedule.obligations.length,
      openPayouts: schedule.payouts.length,
      endDate: schedule.totals.endDate,
      activatedAt: nowIso(),
      activatedBy: actor.uid,
      updatedAt: nowIso(),
    });
    audit(tx, { actorId: actor.uid, action: "gam3ya.activated", entityType: "gam3ya", entityId: gid, gam3yaId: gid, before: null, after: { totalShares: g.totalShares, contributionPerShare: g.contributionPerShare }, reason: null });
  });
}

// ─────────────────────────────── Recording ───────────────────────────────

export async function recordContribution(actor: Actor | null, gid: string, oid: string, change: ContributionChange) {
  await db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    const oSnap = await tx.get(refs.obligation(gid, oid));
    if (!oSnap.exists) throw new PolicyError("not_found");
    const o = oSnap.data()!;
    const today = todayIn(g.timezone);
    const fields = decideContributionRecord(actor, g, o, change, today);

    const before = isContributionSettled(o.recordStatus);
    const after = isContributionSettled(fields.recordStatus);
    const openObligations = g.openObligations + (before && !after ? 1 : !before && after ? -1 : 0);
    const next = nextLifecycle({ ...g, openObligations }, today);
    const existing = next === "completed" && g.status !== "completed" ? await readNotificationState(tx, completionKeys(gid, g)) : new Set<string>();

    const now = nowIso();
    tx.update(oSnap.ref, { ...fields, recordedBy: actor!.uid, statusUpdatedAt: now });
    record(tx, gid, { kind: "contribution", targetId: oid, userIds: [o.userId], cycleNumber: o.cycleNumber, fromStatus: o.recordStatus, toStatus: fields.recordStatus, date: fields.recordedPaymentDate, reason: fields.statusReason, recordedBy: actor!.uid });
    audit(tx, { actorId: actor!.uid, action: `contribution.${fields.recordStatus ?? "cleared"}`, entityType: "obligation", entityId: oid, gam3yaId: gid, before: { status: o.recordStatus }, after: { status: fields.recordStatus, date: fields.recordedPaymentDate }, reason: fields.statusReason });
    tx.update(refs.gam3ya(gid), { openObligations, updatedAt: now, ...applyLifecycle(tx, gid, g, next, existing, actor!.uid) });
  });
}

export async function recordPayout(actor: Actor | null, gid: string, pid: string, change: PayoutChange) {
  await db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    const pSnap = await tx.get(refs.payout(gid, pid));
    if (!pSnap.exists) throw new PolicyError("not_found");
    const p = pSnap.data()!;
    const today = todayIn(g.timezone);
    const fields = decidePayoutRecord(actor, g, p, change, today);

    const before = isPayoutSettled(p.recordStatus);
    const after = isPayoutSettled(fields.recordStatus);
    const openPayouts = g.openPayouts + (before && !after ? 1 : !before && after ? -1 : 0);
    const next = nextLifecycle({ ...g, openPayouts }, today);
    const notifyKeys = fields.recordStatus === "reported_completed" || fields.recordStatus === "confirmed_completed" ? p.recipientIds.map((u) => `payout_completed:${pid}:${u}`) : [];
    const existing = await readNotificationState(tx, [...notifyKeys, ...(next === "completed" && g.status !== "completed" ? completionKeys(gid, g) : [])]);

    const now = nowIso();
    tx.update(pSnap.ref, { ...fields, recordedBy: actor!.uid, statusUpdatedAt: now });
    record(tx, gid, { kind: "payout", targetId: pid, userIds: p.recipientIds, cycleNumber: p.cycleNumber, fromStatus: p.recordStatus, toStatus: fields.recordStatus, date: fields.recordedCompletionDate, reason: fields.statusReason, recordedBy: actor!.uid });
    audit(tx, { actorId: actor!.uid, action: `payout.${fields.recordStatus ?? "cleared"}`, entityType: "payout", entityId: pid, gam3yaId: gid, before: { status: p.recordStatus }, after: { status: fields.recordStatus, date: fields.recordedCompletionDate }, reason: fields.statusReason });
    for (const [i, u] of p.recipientIds.entries()) {
      const key = notifyKeys[i];
      if (key && !existing.has(key)) tx.create(refs.notification(key), notificationDoc({ userId: u, kind: "payout_marked_completed", gam3yaId: gid, params: { gam3ya: g.name }, dedupeKey: key }));
    }
    tx.update(refs.gam3ya(gid), { openPayouts, updatedAt: now, ...applyLifecycle(tx, gid, g, next, existing, actor!.uid) });
  });
}

// ─────────────────────────── Schedule changes ───────────────────────────

export async function proposeSwap(actor: Actor | null, gid: string, shareA: number, shareB: number, reason: string) {
  return db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    decideProposeSwap(actor, g, shareA, shareB, reason);
    const ref = refs.changeRequests(gid).doc();
    const doc: ChangeRequestDoc = { kind: "swap_turns", shareA, shareB, reason: reason.trim(), status: "pending", proposedBy: actor!.uid, reviewedBy: null, reviewNote: null, createdAt: nowIso(), reviewedAt: null };
    tx.create(ref, doc);
    audit(tx, { actorId: actor!.uid, action: "change_request.proposed", entityType: "change_request", entityId: ref.id, gam3yaId: gid, before: null, after: { shareA, shareB }, reason });
    return ref.id;
  });
}

/** Approval creates schedule version n+1; version n stays intact (history). */
export async function reviewChangeRequest(actor: Actor | null, gid: string, rid: string, approve: boolean, note: string | null) {
  assertSuperAdmin(actor);
  await db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    const rSnap = await tx.get(refs.changeRequest(gid, rid));
    if (!rSnap.exists || rSnap.data()!.status !== "pending") throw new PolicyError("invalid_operation");
    const r = rSnap.data()!;
    const now = nowIso();
    let newVersion: number | null = null;

    if (approve) {
      if (g.status !== "active") throw new PolicyError("invalid_operation");
      const current = (await tx.get(refs.payouts(gid).where("isCurrent", "==", true))).docs.map((d) => ({ ref: d.ref, ...(d.data() as PayoutDoc) }));
      const order = applySwap(g.turnOrder, current, r.shareA, r.shareB);
      newVersion = g.currentScheduleVersion + 1;
      const keys = g.memberIds.map((u) => `gam3ya_schedule_updated:${gid}:v${newVersion}:${u}`);
      const existing = await readNotificationState(tx, keys);
      let open = 0;
      for (const p of current) {
        const share = order[p.cycleNumber - 1]!;
        const affected = p.recipientShare === r.shareA || p.recipientShare === r.shareB;
        const holders = shareHolders(g, share);
        const doc: PayoutDoc = {
          ...p,
          scheduleVersion: newVersion,
          isCurrent: true,
          recipientShare: share,
          recipients: holders.map((h) => ({ userId: h.userId, portionBp: h.portionBp, amount: portionOf(p.expectedAmount, h.portionBp) })),
          recipientIds: holders.map((h) => h.userId),
          recordStatus: affected ? null : p.recordStatus,
          recordedCompletionDate: affected ? null : p.recordedCompletionDate,
          recordedBy: affected ? null : p.recordedBy,
          statusReason: affected ? null : p.statusReason,
          statusUpdatedAt: affected ? null : p.statusUpdatedAt,
        };
        delete (doc as Partial<{ ref: unknown }>).ref;
        if (!isPayoutSettled(doc.recordStatus)) open++;
        tx.update(p.ref, { isCurrent: false });
        tx.create(refs.payout(gid, payoutId(newVersion, p.cycleNumber)), doc);
      }
      tx.update(refs.gam3ya(gid), { currentScheduleVersion: newVersion, turnOrder: order, openPayouts: open, updatedAt: now });
      g.memberIds.forEach((u, i) => {
        if (!existing.has(keys[i]!)) tx.create(refs.notification(keys[i]!), notificationDoc({ userId: u, kind: "gam3ya_schedule_updated", gam3yaId: gid, params: { gam3ya: g.name }, dedupeKey: keys[i]! }));
      });
    }
    tx.update(rSnap.ref, { status: approve ? "approved" : "rejected", reviewedBy: actor.uid, reviewNote: note?.trim() || null, reviewedAt: now });
    audit(tx, { actorId: actor.uid, action: approve ? "change_request.approved" : "change_request.rejected", entityType: "change_request", entityId: rid, gam3yaId: gid, before: null, after: { newVersion }, reason: note });
  });
}

// ─────────────────────────────── Lifecycle ───────────────────────────────

/** Managers can re-check; the daily job calls it with actor = null (system). */
export async function evaluateLifecycle(actor: Actor | null, gid: string, system = false): Promise<Gam3yaLifecycle> {
  return db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    if (!system && !canManage(actor, g)) throw new PolicyError("not_authorized");
    const next = nextLifecycle(g, todayIn(g.timezone));
    if (next === g.status) return next;
    const existing = next === "completed" ? await readNotificationState(tx, completionKeys(gid, g)) : new Set<string>();
    tx.update(refs.gam3ya(gid), { updatedAt: nowIso(), ...applyLifecycle(tx, gid, g, next, existing, actor?.uid ?? null) });
    return next;
  });
}

export async function restoreGam3ya(actor: Actor | null, gid: string, reason: string) {
  assertSuperAdmin(actor);
  if (reason.trim().length < 3) throw new PolicyError("reason_required");
  await db().runTransaction(async (tx) => {
    const g = await loadGam3ya(tx, gid);
    if (g.status !== "completed") throw new PolicyError("invalid_operation");
    tx.update(refs.gam3ya(gid), { status: "needs_closure", completedAt: null, archivedAt: null, updatedAt: nowIso() });
    audit(tx, { actorId: actor.uid, action: "gam3ya.restored", entityType: "gam3ya", entityId: gid, gam3yaId: gid, before: { status: "completed" }, after: { status: "needs_closure" }, reason });
  });
}
