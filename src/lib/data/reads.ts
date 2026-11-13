import "server-only";
import { db } from "@/lib/firebase/admin";
import type { MemberObligation, MemberPayout } from "@/lib/engine/summary";
import { canManage, canSeeMemberNames, canView, isMemberOf, isUsable, memberNumbers, PolicyError, type Actor } from "./policy";
import { refs } from "./store";
import type { ChangeRequestDoc, Gam3yaDoc, NotificationDoc, ObligationDoc, PayoutDoc, PaymentMethodDoc, RecordDoc } from "./types";
import { usersByIds } from "./users";

/**
 * Read models. Every function authorizes the actor first and members only
 * ever receive their own rows (the browser has no Firestore access at all).
 */

export type Gam3yaView = Gam3yaDoc & { id: string };

export interface MyGam3ya {
  gam3ya: Gam3yaView;
  isMember: boolean;
  shares: { shareNumber: number; portionBp: number }[];
  isOrganizer: boolean;
}

export async function getMyGam3yas(actor: Actor): Promise<MyGam3ya[]> {
  if (!isUsable(actor)) return [];
  const [asMember, asOrganizer] = await Promise.all([
    refs.gam3yas().where("memberIds", "array-contains", actor.uid).get(),
    refs.gam3yas().where("organizerIds", "array-contains", actor.uid).get(),
  ]);
  const out = new Map<string, MyGam3ya>();
  for (const d of asMember.docs) {
    const g = { id: d.id, ...(d.data() as Gam3yaDoc) };
    if (g.status === "draft") continue;
    out.set(d.id, {
      gam3ya: g,
      isMember: true,
      isOrganizer: false,
      shares: g.holdings.filter((h) => h.userId === actor.uid).map((h) => ({ shareNumber: h.shareNumber, portionBp: h.portionBp })).sort((a, b) => a.shareNumber - b.shareNumber),
    });
  }
  for (const d of asOrganizer.docs) {
    const existing = out.get(d.id);
    if (existing) existing.isOrganizer = true;
    else out.set(d.id, { gam3ya: { id: d.id, ...(d.data() as Gam3yaDoc) }, isMember: false, isOrganizer: true, shares: [] });
  }
  return [...out.values()].sort((a, b) => a.gam3ya.name.localeCompare(b.gam3ya.name));
}

export interface ObligationView extends MemberObligation {
  id: string;
  gam3yaName: string;
  recordedPaymentDate: string | null;
  statusUpdatedAt: string | null;
}

export async function getMyObligations(actor: Actor, gam3yaId?: string): Promise<ObligationView[]> {
  if (!isUsable(actor)) return [];
  const q = gam3yaId
    ? refs.obligations(gam3yaId).where("userId", "==", actor.uid)
    : db().collectionGroup("obligations").where("userId", "==", actor.uid);
  const snap = await q.get();
  return snap.docs
    .map((d) => {
      const o = d.data() as ObligationDoc;
      return {
        id: d.id,
        gam3yaId: o.gam3yaId,
        gam3yaName: o.gam3yaName,
        cycleNumber: o.cycleNumber,
        dueDate: o.dueDate,
        amount: o.amount,
        record: o.recordStatus,
        graceDays: o.graceDays,
        recordedPaymentDate: o.recordedPaymentDate,
        statusUpdatedAt: o.statusUpdatedAt,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.gam3yaId.localeCompare(b.gam3yaId));
}

export interface PayoutView extends MemberPayout {
  id: string;
  gam3yaName: string;
  shareNumber: number;
  portionBp: number;
  potAmount: number;
}

/** The member's own share of each current-version payout. */
export async function getMyPayouts(actor: Actor, gam3yaId?: string): Promise<PayoutView[]> {
  if (!isUsable(actor)) return [];
  const base = gam3yaId ? refs.payouts(gam3yaId) : db().collectionGroup("payouts");
  const snap = await base.where("recipientIds", "array-contains", actor.uid).where("isCurrent", "==", true).get();
  return snap.docs
    .map((d) => {
      const p = d.data() as PayoutDoc;
      const mine = p.recipients.find((r) => r.userId === actor.uid)!;
      return {
        id: d.id,
        gam3yaId: p.gam3yaId,
        gam3yaName: p.gam3yaName,
        cycleNumber: p.cycleNumber,
        shareNumber: p.recipientShare,
        portionBp: mine.portionBp,
        potAmount: p.expectedAmount,
        payoutDate: p.scheduledDate,
        amount: mine.amount,
        record: p.recordStatus,
        graceDays: p.graceDays,
      };
    })
    .sort((a, b) => a.payoutDate.localeCompare(b.payoutDate));
}

export async function getGam3yaForViewer(actor: Actor, gid: string): Promise<Gam3yaView | null> {
  const snap = await refs.gam3ya(gid).get();
  if (!snap.exists) return null;
  const g = { id: gid, ...(snap.data() as Gam3yaDoc) };
  return canView(actor, g) ? g : null;
}

export interface TurnRow {
  cycle_number: number;
  share_number: number;
  scheduled_date: string;
  expected_amount: number;
  is_completed: boolean;
  /** display_name is null unless the viewer is the admin — others see "Member {member_no}". */
  holders: { display_name: string | null; member_no: number; portion_bp: number; is_me: boolean }[];
}

/**
 * Payout order. Members never see each other's names (only "Member 1, 2, 3…"
 * and "You"); only the admin sees real names. No contact info, no others'
 * payment status.
 */
export async function getTurns(actor: Actor, g: Gam3yaView): Promise<TurnRow[]> {
  if (!canView(actor, g)) throw new PolicyError("not_authorized");
  const showNames = canSeeMemberNames(actor);
  const numbers = memberNumbers(g.holdings);
  const [snap, people] = await Promise.all([
    refs.payouts(g.id).where("isCurrent", "==", true).get(),
    showNames ? usersByIds(g.holdings.map((h) => h.userId)) : Promise.resolve(new Map<string, { displayName: string }>()),
  ]);
  return snap.docs
    .map((d) => d.data() as PayoutDoc)
    .sort((a, b) => a.cycleNumber - b.cycleNumber)
    .map((p) => ({
      cycle_number: p.cycleNumber,
      share_number: p.recipientShare,
      scheduled_date: p.scheduledDate,
      expected_amount: p.expectedAmount,
      is_completed: p.recordStatus === "confirmed_completed",
      holders: p.recipients
        .slice()
        .sort((a, b) => b.portionBp - a.portionBp)
        .map((r) => ({
          display_name: showNames ? (people.get(r.userId)?.displayName ?? "—") : null,
          member_no: numbers.get(r.userId) ?? 0,
          portion_bp: r.portionBp,
          is_me: r.userId === actor.uid,
        })),
    }));
}

export async function getOrganizerNames(g: Gam3yaView) {
  const people = await usersByIds(g.organizerIds);
  return g.organizerIds.map((id) => people.get(id)?.displayName ?? "—");
}

/**
 * Organizer/admin view: every member's rows and how each member said they'll
 * pay. Names and phone numbers are for the admin only — an organizer sees
 * "Member 1, 2, 3…" like everyone else.
 */
export async function getManageData(actor: Actor, gid: string) {
  const snap = await refs.gam3ya(gid).get();
  if (!snap.exists) return null;
  const g = { id: gid, ...(snap.data() as Gam3yaDoc) };
  if (!canManage(actor, g)) return null;
  const showNames = canSeeMemberNames(actor);
  const numbers = memberNumbers(g.holdings);
  const [obs, pays, reqs, people, methods] = await Promise.all([
    refs.obligations(gid).get(),
    refs.payouts(gid).where("isCurrent", "==", true).get(),
    refs.changeRequests(gid).where("status", "==", "pending").get(),
    showNames ? usersByIds(g.memberIds) : Promise.resolve(new Map<string, { displayName: string; phone: string | null }>()),
    refs.paymentMethods(gid).get(),
  ]);
  const methodOf = new Map(methods.docs.map((d) => [d.id, (d.data() as PaymentMethodDoc).text]));
  const obligations = obs.docs
    .map((d) => ({ id: d.id, o: d.data() as ObligationDoc }))
    .map(({ id, o }) => ({
      id,
      o,
      memberNo: numbers.get(o.userId) ?? 0,
      name: showNames ? (people.get(o.userId)?.displayName ?? "—") : null,
      phone: showNames ? (people.get(o.userId)?.phone ?? null) : null,
      paymentMethod: methodOf.get(o.userId) ?? null,
    }))
    .sort((a, b) => a.o.cycleNumber - b.o.cycleNumber || a.memberNo - b.memberNo);
  const members = [...numbers.entries()].map(([uid, memberNo]) => ({
    memberNo,
    name: showNames ? (people.get(uid)?.displayName ?? "—") : null,
    paymentMethod: methodOf.get(uid) ?? null,
  }));
  const payouts = pays.docs.map((d) => ({ id: d.id, ...(d.data() as PayoutDoc) })).sort((a, b) => a.cycleNumber - b.cycleNumber);
  const pending = reqs.docs.map((d) => ({ id: d.id, ...(d.data() as ChangeRequestDoc) }));
  return { gam3ya: g, obligations, payouts, pending, members };
}

/** The member's own "how I'll pay" note for one Gam3ya (nobody else's). */
export async function getMyPaymentMethod(actor: Actor, g: Gam3yaView): Promise<string | null> {
  if (!isMemberOf(actor, g)) return null;
  const snap = await refs.paymentMethod(g.id, actor.uid).get();
  return snap.exists ? snap.data()!.text : null;
}

export async function getNotifications(actor: Actor, limit = 50, unreadOnly = false) {
  let q = refs.notifications().where("userId", "==", actor.uid);
  if (unreadOnly) q = q.where("readAt", "==", null);
  const snap = await q.orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as NotificationDoc) }));
}

export async function unreadCount(actor: Actor) {
  const c = await refs.notifications().where("userId", "==", actor.uid).where("readAt", "==", null).count().get();
  return c.data().count;
}

export async function markNotificationsRead(actor: Actor, ids?: string[]) {
  const targets = ids?.length
    ? (await db().getAll(...ids.map((id) => refs.notifications().doc(id)))).filter((s) => s.exists && s.data()!.userId === actor.uid)
    : (await refs.notifications().where("userId", "==", actor.uid).where("readAt", "==", null).limit(500).get()).docs;
  const batch = db().batch();
  const at = new Date().toISOString();
  for (const s of targets) batch.update(s.ref, { readAt: at });
  await batch.commit();
}

/** Status changes on the member's own contributions/payouts. */
export async function getRecentActivity(actor: Actor, limit = 6) {
  const snap = await db().collectionGroup("records").where("userIds", "array-contains", actor.uid).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const r = d.data() as RecordDoc;
    return { id: d.id, gam3yaId: d.ref.parent.parent!.id, ...r };
  });
}
