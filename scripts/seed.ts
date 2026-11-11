/**
 * Development seed — creates demo users (via Supabase Auth admin API) and two
 * realistic Gam3yas through the SAME service code the app uses (RLS-scoped,
 * validated by the engine and re-verified by the database).
 *
 *   SEED_ALLOW=true npm run db:seed
 *
 * Refuses to run in production. Demo users get SEED_PASSWORD.
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { runAsUser } from "../src/lib/db/client";
import { activateDraft, createDraft, setDraftHoldings, setDraftTurns } from "../src/lib/gam3ya/drafts";
import { addDays, monthWithDay, todayIn } from "../src/lib/engine/dates";

const USERS = [
  { key: "admin", email: "admin@yala.dev", name: "Admin", role: "super_admin" },
  { key: "mona", email: "mona@yala.dev", name: "منى (منظمة)", role: "organizer" },
  { key: "ahmed", email: "ahmed@yala.dev", name: "أحمد", role: "member" },
  { key: "sara", email: "sara@yala.dev", name: "سارة", role: "member" },
  { key: "karim", email: "karim@yala.dev", name: "كريم", role: "member" },
  { key: "nour", email: "nour@yala.dev", name: "نور", role: "member" },
  { key: "omar", email: "omar@yala.dev", name: "عمر", role: "member" },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.SEED_ALLOW !== "true") {
    throw new Error("Seeding is disabled. Set SEED_ALLOW=true (development only).");
  }
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.SEED_PASSWORD;
  if (!url || !supaUrl || !secret || !password) throw new Error("Missing DATABASE_URL / Supabase keys / SEED_PASSWORD");

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const supa = createClient(supaUrl, secret, { auth: { persistSession: false } });

  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const { data, error } = await supa.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: u.name, locale: "ar" },
    });
    let id = data.user?.id;
    if (error) {
      const [row] = await client`select id from auth.users where email = ${u.email}`;
      id = row?.id as string | undefined;
    }
    if (!id) throw new Error(`could not create ${u.email}: ${error?.message}`);
    ids[u.key] = id;
    await client`update public.profiles set platform_role = ${u.role} where id = ${id}`;
  }
  // Demo users accept the current policies so they land on the dashboard.
  await client`insert into public.policy_acceptances (user_id, policy_version_id, locale)
    select p.id, v.id, 'ar' from public.profiles p cross join public.policy_versions v
    where v.is_current and v.kind in ('terms','privacy') on conflict do nothing`;

  const admin = { sub: ids.admin!, aal: "aal2" as const };
  const today = todayIn();
  const [y, m] = today.split("-").map(Number) as [number, number];
  const threeMonthsAgo = monthWithDay(y, m, -3, 1);

  await runAsUser(db, admin, async (tx) => {
    // Family Gam3ya: 6 shares × EGP 2,000, started 3 months ago; سارة & كريم share a half each.
    const g1 = await createDraft(tx, ids.admin!, { name: "جمعية العيلة", organizerIds: [ids.mona!] }, {
      contributionPerShare: 200_000, totalShares: 6, frequency: "monthly", startDate: threeMonthsAgo,
      dueDay: 5, payoutOffsetDays: 0, graceDays: 3, allowSelfReport: true,
    });
    await setDraftHoldings(tx, g1, [
      { shareNumber: 1, userId: ids.mona!, portionBp: 10000 },
      { shareNumber: 2, userId: ids.ahmed!, portionBp: 10000 },
      { shareNumber: 3, userId: ids.sara!, portionBp: 5000 },
      { shareNumber: 3, userId: ids.karim!, portionBp: 5000 },
      { shareNumber: 4, userId: ids.nour!, portionBp: 10000 },
      { shareNumber: 5, userId: ids.ahmed!, portionBp: 10000 },
      { shareNumber: 6, userId: ids.omar!, portionBp: 10000 },
    ]);
    await setDraftTurns(tx, g1, [1, 2, 3, 4, 5, 6].map((n) => ({ shareNumber: n, cycleNumber: n })));
    await activateDraft(tx, g1);

    // Work Gam3ya: 10 shares × EGP 1,000 starting next month.
    const g2 = await createDraft(tx, ids.admin!, { name: "جمعية الشغل", organizerIds: [ids.mona!] }, {
      contributionPerShare: 100_000, totalShares: 10, frequency: "monthly", startDate: addDays(today, 20),
      dueDay: 28, payoutOffsetDays: 2, graceDays: 3, allowSelfReport: false,
    });
    const members = [ids.mona!, ids.ahmed!, ids.sara!, ids.karim!, ids.nour!, ids.omar!, ids.ahmed!, ids.sara!, ids.nour!, ids.omar!];
    await setDraftHoldings(tx, g2, members.map((userId, i) => ({ shareNumber: i + 1, userId, portionBp: 10000 as const })));
    await setDraftTurns(tx, g2, [3, 7, 1, 9, 2, 10, 4, 6, 5, 8].map((shareNumber, i) => ({ shareNumber, cycleNumber: i + 1 })));
    await activateDraft(tx, g2);
  });

  // Record history for the first two cycles of the family Gam3ya as the organizer.
  await runAsUser(db, { sub: ids.mona!, aal: "aal1" }, async (tx) => {
    const obs = (await tx.execute(sql`select o.id from public.contribution_obligations o join public.gam3yas g on g.id = o.gam3ya_id
      where g.name = 'جمعية العيلة' and o.cycle_number <= 2`)) as unknown as { id: string }[];
    for (const o of obs) await tx.execute(sql`select app.record_contribution(${o.id}::uuid, 'recorded_paid', null, null)`);
    const pays = (await tx.execute(sql`select p.id from public.payouts p join public.gam3yas g on g.id = p.gam3ya_id
      where g.name = 'جمعية العيلة' and p.cycle_number <= 2`)) as unknown as { id: string }[];
    for (const p of pays) await tx.execute(sql`select app.record_payout(${p.id}::uuid, 'confirmed_completed', null, null)`);
  });

  console.log("✓ seeded. Sign in with any of:", USERS.map((u) => u.email).join(", "));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
