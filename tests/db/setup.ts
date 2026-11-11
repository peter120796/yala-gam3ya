/**
 * DB test harness: recreates a scratch database from scratch (Supabase stub →
 * migrations) and offers helpers to run SQL *as* a given user exactly the way
 * the app does (SET LOCAL ROLE authenticated + JWT claims), so RLS applies.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const DB_NAME = process.env.TEST_DATABASE_NAME ?? "yala_rls_test";

export async function resetDatabase(): Promise<Sql> {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();

  const url = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
  const sql = postgres(url, { max: 4, onnotice: () => {} });
  await sql.unsafe(readFileSync(path.join(import.meta.dirname, "supabase-stub.sql"), "utf8"));
  await migrate(drizzle(sql), { migrationsFolder: path.join(import.meta.dirname, "../../drizzle") });
  return sql;
}

export interface Claims {
  sub: string;
  aal?: "aal1" | "aal2";
}

/** Runs `fn` inside a transaction as the given user (RLS enforced). Rolls back if `rollback`. */
export async function asUser<T>(
  sql: Sql,
  claims: Claims | null,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    if (claims) {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", aal: "aal1", ...claims })}, true)`;
      await tx.unsafe("SET LOCAL ROLE authenticated");
    } else {
      await tx.unsafe("SET LOCAL ROLE anon");
    }
    return fn(tx);
  }) as Promise<T>;
}

export async function createUser(sql: Sql, email: string, displayName: string, role = "member"): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (email, raw_user_meta_data)
    values (${email}, ${JSON.stringify({ display_name: displayName })}::jsonb) returning id`;
  if (role !== "member") await sql`update public.profiles set platform_role = ${role} where id = ${row!.id}`;
  return row!.id;
}

/** Postgres error helper — resolves to the SQLSTATE code / message. */
export async function pgError(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    return {
      code: err.cause?.code ?? err.code ?? "",
      message: `${err.message ?? ""} ${err.cause?.message ?? ""}`,
    };
  }
  throw new Error("expected the query to fail, but it succeeded");
}
