/**
 * Database-level security & lifecycle tests against real PostgreSQL.
 * Every query runs exactly like the app runs it: role `authenticated` + JWT
 * claims, so these prove the RLS policies, grants and RPC checks — not the UI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql as dsql } from "drizzle-orm";
import { createUser, pgError, resetDatabase } from "./setup";
import { runAsUser, type Db, type RlsClaims, type Tx } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { activateDraft, createDraft, setDraftHoldings, setDraftTurns } from "@/lib/gam3ya/drafts";
import { proposeTurnSwap, recordContribution, recordPayout, reviewChangeRequest } from "@/lib/gam3ya/recording";
import { DomainError, toDomainError } from "@/lib/gam3ya/errors";

let sql: Sql;
let db: Db;
const u: Record<string, string> = {};
let g1 = ""; // organizer1, members m1 (2 shares), m2, m3+m4 (half share each)
let g2 = ""; // organizer2, members m2 + outsider-ish m5
let gPast = ""; // finished schedule in the past

const claims = (id: string, aal: RlsClaims["aal"] = "aal1"): RlsClaims => ({ sub: id, aal });
const admin = () => claims(u.admin!, "aal2");
const as = <T>(c: RlsClaims, fn: (tx: Tx) => Promise<T>) => runAsUser(db, c, fn);
/** Like the server actions: run as a user, map any failure to a DomainError. */
const attempt = (c: RlsClaims, fn: (tx: Tx) => Promise<unknown>) =>
  runAsUser(db, c, fn).then(() => null, (e: unknown) => toDomainError(e));
const rows = async <T>(tx: Tx, q: ReturnType<typeof dsql>) => (await tx.execute(q)) as unknown as T[];

const financials = (over: Partial<Parameters<typeof createDraft>[3]> = {}) => ({
  contributionPerShare: 100_000,
  totalShares: 4,
  frequency: "monthly" as const,
  startDate: "2026-10-01",
  dueDay: 5,
  payoutOffsetDays: 0,
  graceDays: 3,
  allowSelfReport: false,
  ...over,
});

beforeAll(async () => {
  sql = await resetDatabase();
  db = drizzle(sql, { schema });
  u.admin = await createUser(sql, "admin@yala.test", "Admin", "super_admin");
  u.org1 = await createUser(sql, "org1@yala.test", "Organizer One", "organizer");
  u.org2 = await createUser(sql, "org2@yala.test", "Organizer Two", "organizer");
  for (const m of ["m1", "m2", "m3", "m4", "m5"]) u[m] = await createUser(sql, `${m}@yala.test`, `Member ${m}`);

  g1 = await as(admin(), async (tx) => {
    const id = await createDraft(tx, u.admin!, { name: "Family Gam3ya", organizerIds: [u.org1!] }, financials());
    await setDraftHoldings(tx, id, [
      { shareNumber: 1, userId: u.m1!, portionBp: 10_000 },
      { shareNumber: 2, userId: u.m2!, portionBp: 10_000 },
      { shareNumber: 3, userId: u.m3!, portionBp: 5_000 },
      { shareNumber: 3, userId: u.m4!, portionBp: 5_000 },
      { shareNumber: 4, userId: u.m1!, portionBp: 10_000 },
    ]);
    await setDraftTurns(tx, id, [1, 2, 3, 4].map((n) => ({ shareNumber: n, cycleNumber: n })));
    await activateDraft(tx, id);
    return id;
  });

  g2 = await as(admin(), async (tx) => {
    const id = await createDraft(tx, u.admin!, { name: "Work Gam3ya", organizerIds: [u.org2!] }, financials({ totalShares: 2, contributionPerShare: 250_000 }));
    await setDraftHoldings(tx, id, [
      { shareNumber: 1, userId: u.m2!, portionBp: 10_000 },
      { shareNumber: 2, userId: u.m5!, portionBp: 10_000 },
    ]);
    await setDraftTurns(tx, id, [
      { shareNumber: 1, cycleNumber: 2 },
      { shareNumber: 2, cycleNumber: 1 },
    ]);
    await activateDraft(tx, id);
    return id;
  });

  gPast = await as(admin(), async (tx) => {
    const id = await createDraft(tx, u.admin!, { name: "Old Gam3ya", organizerIds: [u.org1!] }, financials({ totalShares: 2, startDate: "2025-01-01" }));
    await setDraftHoldings(tx, id, [
      { shareNumber: 1, userId: u.m1!, portionBp: 10_000 },
      { shareNumber: 2, userId: u.m2!, portionBp: 10_000 },
    ]);
    await setDraftTurns(tx, id, [1, 2].map((n) => ({ shareNumber: n, cycleNumber: n })));
    await activateDraft(tx, id);
    return id;
  });
}, 120_000);

afterAll(async () => {
  await sql?.end();
});

describe("baseline grants", () => {
  it("anonymous API role cannot read any private table", async () => {
    for (const table of ["profiles", "gam3yas", "contribution_obligations", "payouts", "audit_logs", "notifications"]) {
      const err = await pgError(sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE anon");
        await tx.unsafe(`select * from public.${table}`);
      }));
      expect(err.code, table).toBe("42501");
    }
  });

  it("anonymous role cannot call app RPCs", async () => {
    const err = await pgError(sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE anon");
      await tx.unsafe(`select app.is_super_admin()`);
    }));
    expect(err.code).toBe("42501");
  });

  it("new auth users get a profile and default preferences (Arabic)", async () => {
    const [p] = await sql`select display_name, platform_role from public.profiles where id = ${u.m1!}`;
    expect(p).toMatchObject({ display_name: "Member m1", platform_role: "member" });
    const [pref] = await sql`select locale, theme from public.user_preferences where user_id = ${u.m1!}`;
    expect(pref).toMatchObject({ locale: "ar", theme: "system" });
  });
});

describe("admin authorization (scenario 15)", () => {
  it("super admin without MFA (aal1) cannot create Gam3yas", async () => {
    const err = await attempt(claims(u.admin!, "aal1"), (tx) => createDraft(tx, u.admin!, { name: "x", organizerIds: [u.org1!] }, financials()));
    expect(err?.code).toBe("not_authorized");
  });

  it("organizers and members cannot create Gam3yas", async () => {
    for (const who of [u.org1!, u.m1!]) {
      const err = await attempt(claims(who, "aal2"), (tx) => createDraft(tx, who, { name: "x", organizerIds: [who] }, financials()));
      expect(err?.code).toBe("not_authorized");
    }
  });

  it("activation wrote a consistent schedule and end date", async () => {
    const [g] = await sql`select status, end_date::text, current_schedule_version from public.gam3yas where id = ${g1}`;
    expect(g).toMatchObject({ status: "active", end_date: "2027-01-05", current_schedule_version: 1 });
    const obligations = await sql`select amount::int from public.contribution_obligations where gam3ya_id = ${g1}`;
    expect(obligations).toHaveLength(16); // 4 cycles × 4 members
    const total = obligations.reduce((a, o) => a + (o.amount as number), 0);
    const [pot] = await sql`select sum(expected_amount)::int as s from public.payouts where gam3ya_id = ${g1}`;
    expect(total).toBe(pot!.s); // money in == money out
    expect(total).toBe(1_600_000);
  });

  it("activation re-verifies in the database and rejects an incomplete draft atomically", async () => {
    const result = await as(admin(), async (tx) => {
      const id = await createDraft(tx, u.admin!, { name: "Broken", organizerIds: [u.org1!] }, financials());
      await setDraftHoldings(tx, id, [{ shareNumber: 1, userId: u.m1!, portionBp: 10_000 }]);
      return { id, err: await activateDraft(tx, id).catch((e) => e) };
    });
    expect(result.err).toBeInstanceOf(DomainError);
    expect((result.err as DomainError).code).toBe("schedule_invalid");
    expect((result.err as DomainError).issues.map((i) => i.code)).toContain("SHARE_UNASSIGNED");
  });

  it("the database itself rejects a forged schedule even if app validation were bypassed", async () => {
    const err = await pgError(as(admin(), async (tx) => {
      const id = await createDraft(tx, u.admin!, { name: "Forged", organizerIds: [u.org1!] }, financials({ totalShares: 2 }));
      await setDraftHoldings(tx, id, [
        { shareNumber: 1, userId: u.m1!, portionBp: 10_000 },
        { shareNumber: 2, userId: u.m2!, portionBp: 10_000 },
      ]);
      await setDraftTurns(tx, id, [1, 2].map((n) => ({ shareNumber: n, cycleNumber: n })));
      const ms = await tx.select().from(schema.gam3yaMemberships).where(eq(schema.gam3yaMemberships.gam3yaId, id));
      // Wrong amount for one member (EGP 500 instead of 1,000).
      await tx.insert(schema.contributionObligations).values(
        ms.flatMap((m, i) => [1, 2].map((c) => ({
          gam3yaId: id, scheduleVersion: 1, cycleNumber: c, membershipId: m.id,
          dueDate: c === 1 ? "2026-10-05" : "2026-11-05", amount: i === 0 && c === 1 ? 50_000 : 100_000,
        }))),
      );
      await tx.insert(schema.payouts).values([1, 2].map((c) => ({
        gam3yaId: id, scheduleVersion: 1, cycleNumber: c, recipientShare: c, expectedAmount: 200_000,
        scheduledDate: c === 1 ? "2026-10-05" : "2026-11-05",
      })));
      await tx.execute(dsql`select app.activate_gam3ya(${id}::uuid)`);
    }));
    expect(err.message).toContain("ACTIVATION_OBLIGATIONS_INVALID");
  });

  it("financial configuration is frozen after activation, even for admins", async () => {
    const err = await pgError(as(admin(), (tx) => tx.update(schema.gam3yas).set({ contributionPerShare: 1 }).where(eq(schema.gam3yas.id, g1)),
    ));
    expect(err.message).toContain("immutable");
  });

  it("status cannot be changed by a direct UPDATE", async () => {
    const err = await pgError(as(admin(), (tx) => tx.execute(dsql`update public.gam3yas set status = 'completed' where id = ${g1}`)));
    expect(err.code).toBe("42501");
  });
});

describe("member isolation (scenario 13)", () => {
  it("member sees only their own obligations", async () => {
    const mine = await as(claims(u.m1!), (tx) => tx.select().from(schema.contributionObligations));
    // m1: 4 cycles in g1 + 2 in gPast; holds shares 1 & 4 in g1 → EGP 2,000 per cycle.
    expect(mine).toHaveLength(6);
    expect(mine.filter((o) => o.gam3yaId === g1).every((o) => o.amount === 200_000)).toBe(true);
  });

  it("half-share holders each owe exactly half", async () => {
    const m3 = await as(claims(u.m3!), (tx) => tx.select().from(schema.contributionObligations));
    expect(m3.every((o) => o.amount === 50_000)).toBe(true);
  });

  it("IDOR: fetching another member's obligation by id returns nothing", async () => {
    const [other] = await sql`select o.id from public.contribution_obligations o
      join public.gam3ya_memberships m on m.id = o.membership_id where m.user_id = ${u.m2!} limit 1`;
    const got = await as(claims(u.m1!), (tx) =>
      tx.select().from(schema.contributionObligations).where(eq(schema.contributionObligations.id, other!.id as string)),
    );
    expect(got).toHaveLength(0);
  });

  it("member cannot see other members' profiles or contact info", async () => {
    const profiles = await as(claims(u.m1!), (tx) => tx.select().from(schema.profiles));
    expect(profiles.map((p) => p.id)).toEqual([u.m1]);
  });

  it("member sees the payout order with display names only", async () => {
    const turns = await as(claims(u.m3!), (tx) =>
      rows<{ cycle_number: number; holders: { display_name: string; portion_bp: number; is_me: boolean }[] }>(
        tx, dsql`select * from app.gam3ya_turns(${g1}::uuid)`,
      ),
    );
    expect(turns).toHaveLength(4);
    const split = turns.find((t) => t.cycle_number === 3)!;
    expect(split.holders).toEqual([
      { display_name: "Member m3", portion_bp: 5000, is_me: true },
      { display_name: "Member m4", portion_bp: 5000, is_me: false },
    ]);
    expect(JSON.stringify(turns)).not.toContain("@yala.test");
  });

  it("member sees only payouts of shares they hold", async () => {
    const p = await as(claims(u.m1!), (tx) => tx.select().from(schema.payouts).where(eq(schema.payouts.gam3yaId, g1)));
    expect(p.map((x) => x.recipientShare).sort()).toEqual([1, 4]);
  });

  it("member cannot see Gam3yas they don't belong to", async () => {
    const g = await as(claims(u.m1!), (tx) => tx.select().from(schema.gam3yas));
    expect(g.map((x) => x.id).sort()).toEqual([g1, gPast].sort());
    const err = await pgError(as(claims(u.m1!), (tx) => tx.execute(dsql`select * from app.gam3ya_turns(${g2}::uuid)`)));
    expect(err.code).toBe("42501");
  });

  it("member cannot write financial tables directly", async () => {
    const [ob] = await sql`select o.id from public.contribution_obligations o join public.gam3ya_memberships m on m.id = o.membership_id where m.user_id = ${u.m1!} limit 1`;
    const err = await pgError(as(claims(u.m1!), (tx) =>
      tx.execute(dsql`update public.contribution_obligations set record_status = 'recorded_paid' where id = ${ob!.id as string}`),
    ));
    expect(err.code).toBe("42501");
    const err2 = await pgError(as(claims(u.m1!), (tx) =>
      tx.execute(dsql`insert into public.gam3ya_memberships (gam3ya_id, user_id) values (${g2}, ${u.m1!})`),
    ));
    expect(err2.code).toBe("42501");
  });

  it("member cannot record contributions when self-reporting is off", async () => {
    const [ob] = await sql`select o.id from public.contribution_obligations o join public.gam3ya_memberships m on m.id = o.membership_id where m.user_id = ${u.m1!} and o.gam3ya_id = ${g1} limit 1`;
    const err = await attempt(claims(u.m1!), (tx) => recordContribution(tx, { obligationId: ob!.id, status: "reported_paid" }));
    expect((err as DomainError).code).toBe("not_authorized");
  });

  it("members cannot change their own role or active flag", async () => {
    const err = await pgError(as(claims(u.m1!), (tx) => tx.execute(dsql`update public.profiles set platform_role = 'super_admin' where id = ${u.m1!}`)));
    expect(err.code).toBe("42501");
    await as(claims(u.m1!), (tx) => tx.update(schema.profiles).set({ displayName: "Mona" }).where(eq(schema.profiles.id, u.m1!)));
    const [p] = await sql`select display_name from public.profiles where id = ${u.m1!}`;
    expect(p!.display_name).toBe("Mona");
    await sql`update public.profiles set display_name = 'Member m1' where id = ${u.m1!}`;
  });

  it("drafts are invisible to members", async () => {
    const draftId = await as(admin(), (tx) => createDraft(tx, u.admin!, { name: "Secret draft", organizerIds: [u.org1!] }, financials()));
    await as(admin(), (tx) => setDraftHoldings(tx, draftId, [{ shareNumber: 1, userId: u.m1!, portionBp: 10_000 }]));
    const seen = await as(claims(u.m1!), (tx) => tx.select().from(schema.gam3yas).where(eq(schema.gam3yas.id, draftId)));
    expect(seen).toHaveLength(0);
  });
});

describe("organizer scoping (scenario 14)", () => {
  const obligationOf = async (gid: string, user: string, cycle = 1) => {
    const [r] = await sql`select o.id from public.contribution_obligations o join public.gam3ya_memberships m on m.id = o.membership_id
      where o.gam3ya_id = ${gid} and m.user_id = ${user} and o.cycle_number = ${cycle}`;
    return r!.id as string;
  };

  it("organizer records contributions in their own Gam3ya with full history and audit", async () => {
    const id = await obligationOf(g1, u.m2!);
    await as(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: id, status: "recorded_paid", paymentDate: "2026-10-04" }));
    const [o] = await sql`select record_status, recorded_by, recorded_payment_date::text from public.contribution_obligations where id = ${id}`;
    expect(o).toMatchObject({ record_status: "recorded_paid", recorded_by: u.org1, recorded_payment_date: "2026-10-04" });
    const history = await sql`select from_status, to_status from public.contribution_records where obligation_id = ${id}`;
    expect(history).toEqual([{ from_status: null, to_status: "recorded_paid" }]);
    const audit = await sql`select action, actor_id from public.audit_logs where entity_id = ${id}`;
    expect(audit).toEqual([{ action: "contribution.recorded_paid", actor_id: u.org1 }]);
  });

  it("organizer cannot touch or even see another organizer's Gam3ya", async () => {
    const id = await obligationOf(g2, u.m5!);
    const err = await attempt(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: id, status: "recorded_paid" }));
    expect((err as DomainError).code).toBe("not_authorized");
    const visible = await as(claims(u.org1!), (tx) => tx.select().from(schema.gam3yas).where(eq(schema.gam3yas.id, g2)));
    expect(visible).toHaveLength(0);
  });

  it("organizer sees contact info only for people in Gam3yas they organize", async () => {
    const seen = await as(claims(u.org1!), (tx) => tx.select({ id: schema.profiles.id }).from(schema.profiles));
    const ids = seen.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([u.org1, u.m1, u.m2, u.m3, u.m4]));
    expect(ids).not.toContain(u.m5);
    expect(ids).not.toContain(u.admin);
  });

  it("waiving requires a reason", async () => {
    const id = await obligationOf(g1, u.m3!);
    const err = await attempt(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: id, status: "waived" }));
    expect((err as DomainError).code).toBe("reason_required");
    await as(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: id, status: "waived", reason: "Agreed by group" }));
  });

  it("history and audit logs are append-only, even for the database owner", async () => {
    expect((await pgError(sql`update public.audit_logs set action = 'x'`)).message).toContain("append-only");
    expect((await pgError(sql`delete from public.contribution_records`)).message).toContain("append-only");
  });

  it("organizer sees audit entries only for their Gam3yas", async () => {
    const logs = await as(claims(u.org1!), (tx) => tx.select().from(schema.auditLogs));
    const organized = (await sql`select gam3ya_id from public.gam3ya_organizers where user_id = ${u.org1!}`).map((r) => r.gam3ya_id);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.gam3yaId !== null && organized.includes(l.gam3yaId))).toBe(true);
    expect(logs.some((l) => l.gam3yaId === g2)).toBe(false);
  });
});

describe("self-reporting (Reported Paid)", () => {
  it("member can report paid when enabled, but never record it as confirmed", async () => {
    await as(admin(), (tx) => tx.update(schema.gam3yas).set({ allowSelfReport: true }).where(eq(schema.gam3yas.id, g1)));
    const [ob] = await sql`select o.id from public.contribution_obligations o join public.gam3ya_memberships m on m.id = o.membership_id
      where o.gam3ya_id = ${g1} and m.user_id = ${u.m4!} and o.cycle_number = 1`;
    const id = ob!.id as string;
    const bad = await attempt(claims(u.m4!), (tx) => recordContribution(tx, { obligationId: id, status: "recorded_paid" }));
    expect((bad as DomainError).code).toBe("not_authorized");
    await as(claims(u.m4!), (tx) => recordContribution(tx, { obligationId: id, status: "reported_paid" }));
    const [o] = await sql`select record_status from public.contribution_obligations where id = ${id}`;
    expect(o!.record_status).toBe("reported_paid");
    // Organizer confirms.
    await as(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: id, status: "recorded_paid" }));
    await as(admin(), (tx) => tx.update(schema.gam3yas).set({ allowSelfReport: false }).where(eq(schema.gam3yas.id, g1)));
  });
});

describe("payouts (scenario 11)", () => {
  const payoutOf = async (gid: string, cycle: number) => {
    const [r] = await sql`select p.id from public.payouts p join public.gam3yas g on g.id = p.gam3ya_id
      where p.gam3ya_id = ${gid} and p.cycle_number = ${cycle} and p.schedule_version = g.current_schedule_version`;
    return r!.id as string;
  };

  it("delay keeps the original scheduled date and requires a reason", async () => {
    const id = await payoutOf(g1, 1);
    const err = await attempt(claims(u.org1!), (tx) => recordPayout(tx, { payoutId: id, status: "delayed" }));
    expect((err as DomainError).code).toBe("reason_required");
    await as(claims(u.org1!), (tx) => recordPayout(tx, { payoutId: id, status: "delayed", reason: "Two members late" }));
    const [p] = await sql`select record_status, scheduled_date::text from public.payouts where id = ${id}`;
    expect(p).toMatchObject({ record_status: "delayed", scheduled_date: "2026-10-05" });
  });

  it("organizer reports completion; only the recipient can confirm receipt", async () => {
    const id = await payoutOf(g1, 1); // share 1 → m1
    await as(claims(u.org1!), (tx) => recordPayout(tx, { payoutId: id, status: "reported_completed", completionDate: "2026-10-10" }));
    const notRecipient = await attempt(claims(u.m2!), (tx) => recordPayout(tx, { payoutId: id, status: "confirmed_completed" }));
    expect((notRecipient as DomainError).code).toBe("not_authorized");
    await as(claims(u.m1!), (tx) => recordPayout(tx, { payoutId: id, status: "confirmed_completed" }));
    const [p] = await sql`select record_status, recorded_completion_date::text from public.payouts where id = ${id}`;
    expect(p).toMatchObject({ record_status: "confirmed_completed", recorded_completion_date: "2026-10-10" });
  });
});

describe("schedule change requests (historical preservation)", () => {
  it("organizer proposes a swap; admin approval creates a new version and keeps the old one", async () => {
    const reqId = await as(claims(u.org1!), (tx) => proposeTurnSwap(tx, g1, 2, 4, "Member m2 needs a later turn"));
    const memberCannotReview = await attempt(claims(u.m1!), (tx) => reviewChangeRequest(tx, reqId, true, null));
    expect((memberCannotReview as DomainError).code).toBe("not_authorized");
    await as(admin(), (tx) => reviewChangeRequest(tx, reqId, true, "ok"));

    const [g] = await sql`select current_schedule_version from public.gam3yas where id = ${g1}`;
    expect(g!.current_schedule_version).toBe(2);
    const v1 = await sql`select cycle_number, recipient_share, record_status from public.payouts where gam3ya_id = ${g1} and schedule_version = 1 order by cycle_number`;
    const v2 = await sql`select cycle_number, recipient_share, record_status from public.payouts where gam3ya_id = ${g1} and schedule_version = 2 order by cycle_number`;
    expect(v1.map((r) => r.recipient_share)).toEqual([1, 2, 3, 4]);
    expect(v2.map((r) => r.recipient_share)).toEqual([1, 4, 3, 2]);
    expect(v2[0]!.record_status).toBe("confirmed_completed"); // unaffected history carried over
    const turns = await as(claims(u.m2!), (tx) => rows<{ cycle_number: number; share_number: number }>(tx, dsql`select * from app.gam3ya_turns(${g1}::uuid)`));
    expect(turns.find((t) => t.cycle_number === 4)!.share_number).toBe(2);
  });

  it("cannot swap a turn whose payout is already recorded", async () => {
    const reqId = await as(claims(u.org1!), (tx) => proposeTurnSwap(tx, g1, 1, 3, "swap with completed one"));
    const err = await attempt(admin(), (tx) => reviewChangeRequest(tx, reqId, true, null));
    expect((err as DomainError).code).toBe("change_payout_already_recorded");
  });
});

describe("completion and archiving (scenario 12)", () => {
  it("past end date with open items → needs closure, not archived", async () => {
    const status = await sql.begin(async (tx) => (await tx`select app.apply_lifecycle(${gPast}::uuid) as s`)[0]!.s);
    expect(status).toBe("needs_closure");
    const [g] = await sql`select archived_at from public.gam3yas where id = ${gPast}`;
    expect(g!.archived_at).toBeNull();
  });

  it("settling everything archives automatically; archive is read-only for organizers/members", async () => {
    const obs = await sql`select id from public.contribution_obligations where gam3ya_id = ${gPast}`;
    for (const o of obs) await as(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: o.id, status: "recorded_paid" }));
    const pays = await sql`select id from public.payouts where gam3ya_id = ${gPast}`;
    for (const p of pays) await as(claims(u.org1!), (tx) => recordPayout(tx, { payoutId: p.id, status: "confirmed_completed" }));

    const [g] = await sql`select status, archived_at from public.gam3yas where id = ${gPast}`;
    expect(g!.status).toBe("completed");
    expect(g!.archived_at).not.toBeNull();

    const err = await attempt(claims(u.org1!), (tx) => recordContribution(tx, { obligationId: obs[0]!.id, status: null, reason: "undo" }));
    expect((err as DomainError).code).toBe("not_authorized");
    // Members still see their archived history.
    const history = await as(claims(u.m1!), (tx) => tx.select().from(schema.contributionObligations).where(eq(schema.contributionObligations.gam3yaId, gPast)));
    expect(history).toHaveLength(2);
  });

  it("admin corrections on archived Gam3yas require a reason and are audited; restore works", async () => {
    const [o] = await sql`select id from public.contribution_obligations where gam3ya_id = ${gPast} limit 1`;
    const noReason = await attempt(admin(), (tx) => recordContribution(tx, { obligationId: o!.id, status: "waived" }));
    expect((noReason as DomainError).code).toBe("reason_required");
    await as(admin(), (tx) => tx.execute(dsql`select app.restore_gam3ya(${gPast}::uuid, ${"Correcting an entry"})`));
    const [g] = await sql`select status from public.gam3yas where id = ${gPast}`;
    expect(g!.status).toBe("needs_closure");
    const [a] = await sql`select reason from public.audit_logs where action = 'gam3ya.restored'`;
    expect(a!.reason).toBe("Correcting an entry");
  });
});

describe("deactivation and retention (scenario 20)", () => {
  it("deactivated users lose access but their history is retained", async () => {
    const selfErr = await pgError(as(admin(), (tx) => tx.execute(dsql`select app.admin_set_user_active(${u.admin!}::uuid, false, 'test')`)));
    expect(selfErr.message).toContain("cannot deactivate yourself");

    await as(admin(), (tx) => tx.execute(dsql`select app.admin_set_user_active(${u.m5!}::uuid, false, 'Left the platform')`));
    const visible = await as(claims(u.m5!), (tx) => tx.select().from(schema.contributionObligations));
    expect(visible).toHaveLength(0);
    const [count] = await sql`select count(*)::int as c from public.contribution_obligations o join public.gam3ya_memberships m on m.id = o.membership_id where m.user_id = ${u.m5!}`;
    expect(count!.c).toBe(2);
    await as(admin(), (tx) => tx.execute(dsql`select app.admin_set_user_active(${u.m5!}::uuid, true, 'Came back')`));
    expect(await as(claims(u.m5!), (tx) => tx.select().from(schema.contributionObligations))).toHaveLength(2);
  });

  it("deactivated organizers lose organizer powers", async () => {
    await as(admin(), (tx) => tx.execute(dsql`select app.admin_set_user_active(${u.org2!}::uuid, false, 'Suspended')`));
    const [ob] = await sql`select id from public.contribution_obligations where gam3ya_id = ${g2} limit 1`;
    const err = await attempt(claims(u.org2!), (tx) => recordContribution(tx, { obligationId: ob!.id, status: "recorded_paid" }));
    expect((err as DomainError).code).toBe("not_authorized");
    await as(admin(), (tx) => tx.execute(dsql`select app.admin_set_user_active(${u.org2!}::uuid, true, 'Restored')`));
  });
});

describe("notifications & policies", () => {
  it("users read and mark only their own notifications", async () => {
    await sql`insert into public.notifications (user_id, kind, dedupe_key) values (${u.m1!}, 'test', 'k1'), (${u.m2!}, 'test', 'k2')`;
    const mine = await as(claims(u.m1!), (tx) => tx.select().from(schema.notifications));
    expect(mine.map((n) => n.dedupeKey)).toContain("k1");
    expect(mine.every((n) => n.userId === u.m1)).toBe(true);
    await as(claims(u.m1!), (tx) => tx.update(schema.notifications).set({ readAt: new Date() }).where(eq(schema.notifications.dedupeKey, "k2")));
    const [k2] = await sql`select read_at from public.notifications where dedupe_key = 'k2'`;
    expect(k2!.read_at).toBeNull();
    const err = await pgError(as(claims(u.m1!), (tx) => tx.execute(dsql`update public.notifications set kind = 'x' where dedupe_key = 'k1'`)));
    expect(err.code).toBe("42501");
  });

  it("payout completion notifies the recipient exactly once (report + confirm)", async () => {
    const rows = await sql`select kind, params from public.notifications where user_id = ${u.m1!} and kind = 'payout_marked_completed' and gam3ya_id = ${g1}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.params).toEqual({ gam3ya: "Family Gam3ya" });
    const others = await sql`select 1 from public.notifications where kind = 'payout_marked_completed' and gam3ya_id = ${g1} and user_id <> ${u.m1!}`;
    expect(others).toHaveLength(0);
  });

  it("schedule changes and completion notify members", async () => {
    const [upd] = await sql`select count(*)::int as c from public.notifications where kind = 'gam3ya_schedule_updated' and gam3ya_id = ${g1}`;
    expect(upd!.c).toBe(4); // m1..m4
    const [done] = await sql`select count(*)::int as c from public.notifications where kind = 'gam3ya_completed' and gam3ya_id = ${gPast}`;
    expect(done!.c).toBe(2);
  });

  it("duplicate notifications are impossible (scenario 18)", async () => {
    const err = await pgError(sql`insert into public.notifications (user_id, kind, dedupe_key) values (${u.m1!}, 'test', 'k1')`);
    expect(err.code).toBe("23505");
  });

  it("users can only accept the current policy version", async () => {
    const [cur] = await sql`select id from public.policy_versions where kind = 'terms' and is_current`;
    const [old] = await sql`insert into public.policy_versions (kind, version, effective_at, is_current) values ('terms', '0.9', now(), false) returning id`;
    await as(claims(u.m1!), (tx) => tx.insert(schema.policyAcceptances).values({ userId: u.m1!, policyVersionId: cur!.id as string, locale: "ar" }));
    const err = await pgError(as(claims(u.m1!), (tx) => tx.insert(schema.policyAcceptances).values({ userId: u.m1!, policyVersionId: old!.id as string, locale: "ar" })));
    expect(err.code).toBe("42501");
    const forOther = await pgError(as(claims(u.m1!), (tx) => tx.insert(schema.policyAcceptances).values({ userId: u.m2!, policyVersionId: cur!.id as string, locale: "ar" })));
    expect(forOther.code).toBe("42501");
  });
});

describe("reminders & daily job (scenarios 18 + timezone)", () => {
  it("creates due-in-3-days / tomorrow reminders once, respecting preferences and privacy", async () => {
    const { todayIn, addDays } = await import("@/lib/engine/dates");
    const today = todayIn("Africa/Cairo");
    const in3 = addDays(today, 3);
    const gid = await as(admin(), async (tx) => {
      const id = await createDraft(tx, u.admin!, { name: "Reminder Gam3ya", organizerIds: [u.org1!] },
        financials({ totalShares: 2, startDate: in3, dueDay: Number(in3.slice(8, 10)) }));
      await setDraftHoldings(tx, id, [
        { shareNumber: 1, userId: u.m3!, portionBp: 10_000 },
        { shareNumber: 2, userId: u.m4!, portionBp: 10_000 },
      ]);
      await setDraftTurns(tx, id, [1, 2].map((n) => ({ shareNumber: n, cycleNumber: n })));
      await activateDraft(tx, id);
      return id;
    });
    // m4 opted out of contribution reminders.
    await sql`update public.notification_preferences set contribution_reminders = false where user_id = ${u.m4!}`;

    const { runDailyJob } = await import("@/lib/notifications/job");
    const first = await runDailyJob(db);
    const second = await runDailyJob(db);
    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0); // idempotent

    const rows = await sql`select user_id, kind, params from public.notifications where gam3ya_id = ${gid} and kind like 'contribution_%'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: u.m3, kind: "contribution_due_3d", params: { gam3ya: "Reminder Gam3ya", date: in3 } });
    // Payout this week for m3 (share 1, cycle 1 → in 3 days).
    const pay = await sql`select user_id from public.notifications where gam3ya_id = ${gid} and kind = 'payout_this_week'`;
    expect(pay.map((r) => r.user_id)).toEqual([u.m3]);
    // Emails were processed by the console provider (no real sends), nothing left pending.
    const [pending] = await sql`select count(*)::int as c from public.notifications where email_status in ('pending','sending')`;
    expect(pending!.c).toBe(0);
    expect(first.email.provider).toBe("console");
  });
});
