import "server-only";
import { db } from "@/lib/firebase/admin";
import { addDays, monthKey, addMonthsToKey } from "@/lib/engine/dates";
import { assertSuperAdmin, type Actor } from "@/lib/data/policy";
import { refs } from "@/lib/data/store";
import type { ApprovalStatus, AuditDoc, ChangeRequestDoc, Gam3yaDoc, ObligationDoc, PayoutDoc, PolicyVersionDoc, UserDoc } from "@/lib/data/types";
import { usersByIds } from "@/lib/data/users";

/**
 * Admin read models (super admin + MFA only). Aggregations scan active
 * Gam3yas — fine for thousands of records; move to scheduled rollups if the
 * platform grows far beyond that.
 */

const isOpenContribution = (o: ObligationDoc) => o.recordStatus === null || o.recordStatus === "reported_paid";

async function activeGam3yas() {
  const snap = await refs.gam3yas().where("status", "in", ["active", "needs_closure"]).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Gam3yaDoc) }));
}

export async function getAdminOverview(actor: Actor, today: string) {
  assertSuperAdmin(actor);
  const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
  const [total_users, active_users, active_gam3yas, completed_gam3yas, needs_closure] = await Promise.all([
    count(refs.users()),
    count(refs.users().where("isActive", "==", true).where("approvalStatus", "==", "approved")),
    count(refs.gam3yas().where("status", "==", "active")),
    count(refs.gam3yas().where("status", "==", "completed")),
    count(refs.gam3yas().where("status", "==", "needs_closure")),
  ]);
  const until = addDays(today, 30);
  const pays = await db().collectionGroup("payouts").where("isCurrent", "==", true).where("scheduledDate", ">=", today).where("scheduledDate", "<=", until).get();
  const upcoming = pays.docs.map((d) => d.data() as PayoutDoc).filter((p) => p.recordStatus !== "confirmed_completed");
  const overdue = await db().collectionGroup("obligations").where("dueDate", "<", today).get();
  const overdueCount = overdue.docs.map((d) => d.data() as ObligationDoc).filter((o) => isOpenContribution(o) && addDays(o.dueDate, o.graceDays) < today).length;
  return {
    total_users,
    active_users,
    active_gam3yas,
    completed_gam3yas,
    needs_closure,
    upcoming_payouts: upcoming.length,
    upcoming_payouts_amount: upcoming.reduce((a, p) => a + p.expectedAmount, 0),
    overdue_contributions: overdueCount,
  };
}

export async function getNeedsAction(actor: Actor, today: string) {
  assertSuperAdmin(actor);
  const list = await activeGam3yas();
  const out = [];
  for (const g of list) {
    const [obs, pays] = await Promise.all([refs.obligations(g.id).where("dueDate", "<", today).get(), refs.payouts(g.id).where("isCurrent", "==", true).get()]);
    const os = obs.docs.map((d) => d.data() as ObligationDoc);
    out.push({
      id: g.id,
      name: g.name,
      status: g.status,
      overdue: os.filter((o) => isOpenContribution(o) && addDays(o.dueDate, g.graceDays) < today).length,
      reported: os.filter((o) => o.recordStatus === "reported_paid").length,
      late_payouts: pays.docs.map((d) => d.data() as PayoutDoc).filter((p) => p.recordStatus !== "confirmed_completed" && addDays(p.scheduledDate, g.graceDays) < today).length,
    });
  }
  return out.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "needs_closure" ? -1 : 1));
}

type UserRow = UserDoc & { id: string };

/** Prefix search on lowercased email or name (Firestore has no LIKE). */
async function searchUsers(q: string | null, status?: ApprovalStatus): Promise<UserRow[] | null> {
  if (!q) return null;
  const term = q.toLowerCase();
  const run = (field: "emailLower" | "nameLower") => {
    let query = refs.users().where(field, ">=", term).where(field, "<=", `${term}`);
    if (status) query = query.where("approvalStatus", "==", status);
    return query.limit(200).get();
  };
  const [a, b] = await Promise.all([run("emailLower"), run("nameLower")]);
  const map = new Map<string, UserRow>();
  for (const d of [...a.docs, ...b.docs]) map.set(d.id, { id: d.id, ...(d.data() as UserDoc) });
  return [...map.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

export async function listUsers(actor: Actor, q: string | null, page: number, pageSize = 25) {
  assertSuperAdmin(actor);
  const found = await searchUsers(q);
  let rows: UserRow[];
  let hasMore: boolean;
  if (found) {
    rows = found.reverse().slice(page * pageSize, (page + 1) * pageSize);
    hasMore = found.length > (page + 1) * pageSize;
  } else {
    const snap = await refs.users().orderBy("createdAt", "desc").offset(page * pageSize).limit(pageSize + 1).get();
    const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserDoc) }));
    rows = all.slice(0, pageSize);
    hasMore = all.length > pageSize;
  }
  const counts = await Promise.all(
    rows.map(async (r) => {
      const [m, o] = await Promise.all([
        refs.gam3yas().where("memberIds", "array-contains", r.id).count().get(),
        refs.gam3yas().where("organizerIds", "array-contains", r.id).count().get(),
      ]);
      return { memberships: m.data().count, organizes: o.data().count };
    }),
  );
  return {
    rows: rows.map((r, i) => ({ id: r.id, displayName: r.displayName, email: r.email, phone: r.phone, role: r.role, isActive: r.isActive, approvalStatus: r.approvalStatus, createdAt: new Date(r.createdAt), ...counts[i]! })),
    hasMore,
  };
}

export async function listAllUsersForPicker(actor: Actor) {
  assertSuperAdmin(actor);
  const snap = await refs.users().where("approvalStatus", "==", "approved").where("isActive", "==", true).get();
  return snap.docs
    .map((d) => {
      const u = d.data() as UserDoc;
      return { id: d.id, displayName: u.displayName, email: u.email, role: u.role };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listGam3yas(actor: Actor, status: string | null) {
  assertSuperAdmin(actor);
  const base = status ? refs.gam3yas().where("status", "==", status) : refs.gam3yas();
  const snap = await base.orderBy("createdAt", "desc").limit(200).get();
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Gam3yaDoc) }));
  const people = await usersByIds(list.flatMap((g) => g.organizerIds));
  return list.map((g) => ({ g, members: g.memberIds.length, organizers: g.organizerIds.map((id) => people.get(id)?.displayName ?? "—") }));
}

export async function listPendingRequests(actor: Actor) {
  assertSuperAdmin(actor);
  const snap = await db().collectionGroup("changeRequests").where("status", "==", "pending").orderBy("createdAt").get();
  const rows = snap.docs.map((d) => ({ id: d.id, gam3yaId: d.ref.parent.parent!.id, ...(d.data() as ChangeRequestDoc) }));
  const ids = [...new Set(rows.map((r) => r.gam3yaId))];
  // getAll() throws when called with no references.
  const gs = ids.length ? await db().getAll(...ids.map((id) => refs.gam3ya(id))) : [];
  const names = new Map(gs.filter((s) => s.exists).map((s) => [s.id, (s.data() as Gam3yaDoc).name]));
  const people = await usersByIds(rows.map((r) => r.proposedBy));
  return rows.map((r) => ({ r, gam3yaName: names.get(r.gam3yaId) ?? "—", proposer: people.get(r.proposedBy)?.displayName ?? "—" }));
}

export async function listAudit(actor: Actor, page: number, pageSize = 50) {
  assertSuperAdmin(actor);
  const snap = await refs.audit().orderBy("createdAt", "desc").offset(page * pageSize).limit(pageSize + 1).get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as AuditDoc) }));
  const rows = all.slice(0, pageSize);
  const people = await usersByIds(rows.map((r) => r.actorId).filter((x): x is string => !!x));
  const gs = rows.some((r) => r.gam3yaId) ? await db().getAll(...[...new Set(rows.map((r) => r.gam3yaId).filter((x): x is string => !!x))].map((id) => refs.gam3ya(id))) : [];
  const names = new Map(gs.filter((s) => s.exists).map((s) => [s.id, (s.data() as Gam3yaDoc).name]));
  return {
    rows: rows.map((a) => ({ a: { ...a, createdAt: new Date(a.createdAt) }, actor: a.actorId ? (people.get(a.actorId)?.displayName ?? null) : null, gam3yaName: a.gam3yaId ? (names.get(a.gam3yaId) ?? null) : null })),
    hasMore: all.length > pageSize,
  };
}

export async function listPolicies(actor: Actor) {
  assertSuperAdmin(actor);
  const snap = await refs.policies().get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as PolicyVersionDoc), effectiveAt: new Date((d.data() as PolicyVersionDoc).effectiveAt) }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || b.effectiveAt.getTime() - a.effectiveAt.getTime());
}

export async function getReports(actor: Actor, today: string) {
  assertSuperAdmin(actor);
  const statuses = ["draft", "active", "needs_closure", "completed", "cancelled"] as const;
  const byStatus = (
    await Promise.all(statuses.map(async (s) => ({ status: s, n: (await refs.gam3yas().where("status", "==", s).count().get()).data().count })))
  ).filter((s) => s.n > 0);
  const users = await refs.users().select("createdAt").get();
  const growthMap = new Map<string, number>();
  for (const d of users.docs) {
    const m = String(d.get("createdAt") ?? "").slice(0, 7);
    if (m) growthMap.set(m, (growthMap.get(m) ?? 0) + 1);
  }
  const growth = [...growthMap.entries()].sort().slice(-12).map(([month, n]) => ({ month, users: n }));
  const start = monthKey(today);
  const months = Array.from({ length: 6 }, (_, i) => addMonthsToKey(start, i));
  const monthly = months.map((month) => ({ month, contributions: 0, payouts: 0, activity: 0 }));
  for (const g of await activeGam3yas()) {
    const [obs, pays] = await Promise.all([refs.obligations(g.id).get(), refs.payouts(g.id).where("isCurrent", "==", true).get()]);
    for (const d of obs.docs) {
      const o = d.data() as ObligationDoc;
      const row = monthly.find((m) => m.month === o.dueDate.slice(0, 7));
      if (row) row.contributions += o.amount;
    }
    for (const d of pays.docs) {
      const p = d.data() as PayoutDoc;
      const row = monthly.find((m) => m.month === p.scheduledDate.slice(0, 7));
      if (row) row.payouts += p.expectedAmount;
    }
  }
  const recs = await db().collectionGroup("records").where("createdAt", ">=", `${start}-01`).get();
  for (const d of recs.docs) {
    const row = monthly.find((m) => m.month === String(d.get("createdAt")).slice(0, 7));
    if (row) row.activity++;
  }
  const overview = await getAdminOverview(actor, today);
  const ended = (byStatus.find((s) => s.status === "completed")?.n ?? 0) + (byStatus.find((s) => s.status === "needs_closure")?.n ?? 0);
  return {
    growth,
    byStatus,
    monthly,
    overdue: overview.overdue_contributions,
    completionRate: ended ? Math.round(((byStatus.find((s) => s.status === "completed")?.n ?? 0) / ended) * 100) : null,
  };
}

// ─── Approvals ───
export type ApprovalFilter = ApprovalStatus;

export async function listApprovals(actor: Actor, status: ApprovalFilter, q: string | null, page: number, pageSize = 50) {
  assertSuperAdmin(actor);
  const found = await searchUsers(q, status);
  if (found) {
    return {
      rows: found.slice(page * pageSize, (page + 1) * pageSize).map((u) => ({ id: u.id, displayName: u.displayName, email: u.email, phone: u.phone, createdAt: new Date(u.createdAt) })),
      total: found.length,
      pageSize,
    };
  }
  const base = refs.users().where("approvalStatus", "==", status);
  const [snap, total] = await Promise.all([base.orderBy("createdAt").offset(page * pageSize).limit(pageSize).get(), base.count().get()]);
  return {
    rows: snap.docs.map((d) => {
      const u = d.data() as UserDoc;
      return { id: d.id, displayName: u.displayName, email: u.email, phone: u.phone, createdAt: new Date(u.createdAt) };
    }),
    total: total.data().count,
    pageSize,
  };
}

/** IDs for "select all matching" (capped at 5,000). */
export async function approvalIds(actor: Actor, status: ApprovalFilter, q: string | null, limit = 5000) {
  assertSuperAdmin(actor);
  const found = await searchUsers(q, status);
  if (found) return found.slice(0, limit).map((u) => u.id);
  const snap = await refs.users().where("approvalStatus", "==", status).orderBy("createdAt").limit(limit).select().get();
  return snap.docs.map((d) => d.id);
}

export async function pendingApprovalCount(actor: Actor) {
  assertSuperAdmin(actor);
  return (await refs.users().where("approvalStatus", "==", "pending").count().get()).data().count;
}
