import "server-only";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { auditLogs, changeRequests, gam3yaMemberships, gam3yaOrganizers, gam3yas, policyVersions, profiles } from "@/lib/db/schema";

/** Admin read models. RLS grants super admins (aal2) full visibility; others get nothing. */

export async function getAdminOverview(tx: Tx, today: string) {
  const rows = (await tx.execute(sql`
    select
      (select count(*) from public.profiles)::int as total_users,
      (select count(*) from public.profiles where is_active)::int as active_users,
      (select count(*) from public.gam3yas where status = 'active')::int as active_gam3yas,
      (select count(*) from public.gam3yas where status = 'completed')::int as completed_gam3yas,
      (select count(*) from public.gam3yas where status = 'needs_closure')::int as needs_closure,
      (select count(*) from public.payouts p join public.gam3yas g on g.id = p.gam3ya_id and p.schedule_version = g.current_schedule_version
         where g.status in ('active','needs_closure') and p.record_status is distinct from 'confirmed_completed'
           and p.scheduled_date between ${today}::date and ${today}::date + 30)::int as upcoming_payouts,
      (select coalesce(sum(p.expected_amount),0) from public.payouts p join public.gam3yas g on g.id = p.gam3ya_id and p.schedule_version = g.current_schedule_version
         where g.status in ('active','needs_closure') and p.record_status is distinct from 'confirmed_completed'
           and p.scheduled_date between ${today}::date and ${today}::date + 30)::bigint as upcoming_payouts_amount,
      (select count(*) from public.contribution_obligations o join public.gam3yas g on g.id = o.gam3ya_id
         where g.status in ('active','needs_closure') and (o.record_status is null or o.record_status = 'reported_paid')
           and o.due_date + g.grace_days < ${today}::date)::int as overdue_contributions
  `)) as unknown as Record<string, number | string>[];
  const r = rows[0]!;
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
}

export async function getNeedsAction(tx: Tx, today: string) {
  return (await tx.execute(sql`
    select g.id, g.name, g.status,
      (select count(*) from public.contribution_obligations o where o.gam3ya_id = g.id
         and (o.record_status is null or o.record_status = 'reported_paid') and o.due_date + g.grace_days < ${today}::date)::int as overdue,
      (select count(*) from public.contribution_obligations o where o.gam3ya_id = g.id and o.record_status = 'reported_paid')::int as reported,
      (select count(*) from public.payouts p where p.gam3ya_id = g.id and p.schedule_version = g.current_schedule_version
         and p.record_status is distinct from 'confirmed_completed' and p.scheduled_date + g.grace_days < ${today}::date)::int as late_payouts
    from public.gam3yas g
    where g.status in ('active','needs_closure')
    order by g.status desc, g.name
  `)) as unknown as { id: string; name: string; status: string; overdue: number; reported: number; late_payouts: number }[];
}

export async function listUsers(tx: Tx, q: string | null, page: number, pageSize = 25) {
  const where = q ? or(ilike(profiles.displayName, `%${q}%`), ilike(profiles.email, `%${q}%`)) : undefined;
  const rows = await tx
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
      phone: profiles.phone,
      role: profiles.platformRole,
      isActive: profiles.isActive,
      createdAt: profiles.createdAt,
      memberships: sql<number>`(select count(*) from public.gam3ya_memberships m where m.user_id = ${profiles.id})::int`,
      organizes: sql<number>`(select count(*) from public.gam3ya_organizers o where o.user_id = ${profiles.id})::int`,
    })
    .from(profiles)
    .where(where)
    .orderBy(desc(profiles.createdAt))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function listAllUsersForPicker(tx: Tx) {
  return tx
    .select({ id: profiles.id, displayName: profiles.displayName, email: profiles.email, role: profiles.platformRole })
    .from(profiles)
    .where(eq(profiles.isActive, true))
    .orderBy(profiles.displayName);
}

export async function listGam3yas(tx: Tx, status: string | null) {
  const rows = await tx
    .select({
      g: gam3yas,
      members: sql<number>`(select count(*) from public.gam3ya_memberships m where m.gam3ya_id = ${gam3yas.id})::int`,
    })
    .from(gam3yas)
    .where(status ? eq(gam3yas.status, status) : undefined)
    .orderBy(desc(gam3yas.createdAt))
    .limit(200);
  const ids = rows.map((r) => r.g.id);
  const orgs = ids.length
    ? await tx
        .select({ gam3yaId: gam3yaOrganizers.gam3yaId, name: profiles.displayName })
        .from(gam3yaOrganizers)
        .innerJoin(profiles, eq(profiles.id, gam3yaOrganizers.userId))
        .where(inArray(gam3yaOrganizers.gam3yaId, ids))
    : [];
  return rows.map((r) => ({ ...r, organizers: orgs.filter((o) => o.gam3yaId === r.g.id).map((o) => o.name) }));
}

export async function listPendingRequests(tx: Tx) {
  return tx
    .select({ r: changeRequests, gam3yaName: gam3yas.name, proposer: profiles.displayName })
    .from(changeRequests)
    .innerJoin(gam3yas, eq(gam3yas.id, changeRequests.gam3yaId))
    .innerJoin(profiles, eq(profiles.id, changeRequests.proposedBy))
    .where(eq(changeRequests.status, "pending"))
    .orderBy(changeRequests.createdAt);
}

export async function listAudit(tx: Tx, page: number, pageSize = 50) {
  const rows = await tx
    .select({ a: auditLogs, actor: profiles.displayName, gam3yaName: gam3yas.name })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.id, auditLogs.actorId))
    .leftJoin(gam3yas, eq(gam3yas.id, auditLogs.gam3yaId))
    .orderBy(desc(auditLogs.id))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function listPolicies(tx: Tx) {
  return tx.select().from(policyVersions).orderBy(policyVersions.kind, desc(policyVersions.effectiveAt));
}

export async function getReports(tx: Tx, today: string) {
  const growth = (await tx.execute(sql`
    select to_char(date_trunc('month', created_at at time zone 'Africa/Cairo'), 'YYYY-MM') as month, count(*)::int as users
    from public.profiles group by 1 order by 1 desc limit 12
  `)) as unknown as { month: string; users: number }[];
  const byStatus = await tx.select({ status: gam3yas.status, n: count() }).from(gam3yas).groupBy(gam3yas.status);
  const monthly = (await tx.execute(sql`
    with months as (
      select to_char(generate_series(date_trunc('month', ${today}::date), date_trunc('month', ${today}::date) + interval '5 months', interval '1 month'), 'YYYY-MM') as month
    )
    select m.month,
      coalesce((select sum(o.amount) from public.contribution_obligations o join public.gam3yas g on g.id = o.gam3ya_id
        where g.status in ('active','needs_closure') and to_char(o.due_date, 'YYYY-MM') = m.month), 0)::bigint as contributions,
      coalesce((select sum(p.expected_amount) from public.payouts p join public.gam3yas g on g.id = p.gam3ya_id and p.schedule_version = g.current_schedule_version
        where g.status in ('active','needs_closure') and to_char(p.scheduled_date, 'YYYY-MM') = m.month), 0)::bigint as payouts,
      (select count(*) from public.contribution_records r where to_char(r.created_at at time zone 'Africa/Cairo', 'YYYY-MM') = m.month)::int as activity
    from months m order by m.month
  `)) as unknown as { month: string; contributions: string; payouts: string; activity: number }[];
  const [overdue] = (await tx.execute(sql`
    select count(*)::int as n from public.contribution_obligations o join public.gam3yas g on g.id = o.gam3ya_id
    where g.status in ('active','needs_closure') and (o.record_status is null or o.record_status = 'reported_paid') and o.due_date + g.grace_days < ${today}::date
  `)) as unknown as { n: number }[];
  const finished = byStatus.filter((s) => s.status === "completed").reduce((a, s) => a + s.n, 0);
  const ended = byStatus.filter((s) => s.status === "completed" || s.status === "needs_closure").reduce((a, s) => a + s.n, 0);
  return {
    growth: growth.reverse(),
    byStatus,
    monthly: monthly.map((m) => ({ ...m, contributions: Number(m.contributions), payouts: Number(m.payouts) })),
    overdue: overdue?.n ?? 0,
    completionRate: ended ? Math.round((finished / ended) * 100) : null,
  };
}

export async function membershipsOf(tx: Tx, userId: string) {
  return tx
    .select({ id: gam3yas.id, name: gam3yas.name, status: gam3yas.status })
    .from(gam3yaMemberships)
    .innerJoin(gam3yas, eq(gam3yas.id, gam3yaMemberships.gam3yaId))
    .where(and(eq(gam3yaMemberships.userId, userId)));
}
