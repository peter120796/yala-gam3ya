/**
 * Applies Drizzle migrations (tables + security layer).
 *   npm run db:migrate
 * Uses DATABASE_URL_DIRECT (session/direct connection) — not the transaction pooler.
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL_DIRECT (or DATABASE_URL) to run migrations.");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("✓ migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
