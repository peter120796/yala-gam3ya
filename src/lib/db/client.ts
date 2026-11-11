import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface RlsClaims {
  sub: string;
  aal: "aal1" | "aal2";
  role?: "authenticated";
  [k: string]: unknown;
}

const globalForDb = globalThis as unknown as { __yalaDb?: Db };

/**
 * Privileged connection (bypasses RLS). Use it ONLY through `runAsUser` for
 * user requests; direct use is reserved for trusted system jobs (cron).
 * The Supabase transaction pooler needs `prepare: false`.
 */
export function getDb(): Db {
  if (!globalForDb.__yalaDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20, onnotice: () => {} });
    globalForDb.__yalaDb = drizzle(client, { schema });
  }
  return globalForDb.__yalaDb;
}

/**
 * Runs `fn` in a transaction as the authenticated user: the role is switched
 * to `authenticated` and the verified JWT claims are installed, so every
 * query inside is subject to the same RLS policies as the Supabase API.
 */
export async function runAsUser<T>(database: Db, claims: RlsClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", ...claims })}, true),
                 set_config('role', 'authenticated', true)`,
    );
    return fn(tx);
  });
}

/** Trusted system work (scheduled jobs). Never call with user-controlled scope. */
export async function runAsSystem<T>(database: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return database.transaction(fn);
}

export { schema };
