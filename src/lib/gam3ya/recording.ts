import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/client";
import { contributionRecordSchema, payoutRecordSchema } from "@/lib/validation/gam3ya";
import { toDomainError } from "./errors";

/**
 * Status recording. Authorization, validation, history and audit rows are all
 * enforced inside the SECURITY DEFINER database functions, atomically.
 * Statuses are informational records — never bank-verified transactions.
 */
export async function recordContribution(tx: Tx, input: unknown): Promise<void> {
  const v = contributionRecordSchema.parse(input);
  try {
    await tx.execute(
      sql`select app.record_contribution(${v.obligationId}::uuid, ${v.status}::text, ${v.paymentDate ?? null}::date, ${v.reason ?? null}::text)`,
    );
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function recordPayout(tx: Tx, input: unknown): Promise<void> {
  const v = payoutRecordSchema.parse(input);
  try {
    await tx.execute(
      sql`select app.record_payout(${v.payoutId}::uuid, ${v.status}::text, ${v.completionDate ?? null}::date, ${v.reason ?? null}::text)`,
    );
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function proposeTurnSwap(tx: Tx, gam3yaId: string, shareA: number, shareB: number, reason: string) {
  try {
    const rows = await tx.execute<{ id: string }>(
      sql`select app.propose_turn_swap(${gam3yaId}::uuid, ${shareA}::smallint, ${shareB}::smallint, ${reason}::text) as id`,
    );
    return rows[0]!.id;
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function reviewChangeRequest(tx: Tx, requestId: string, approve: boolean, note: string | null) {
  try {
    await tx.execute(sql`select app.review_change_request(${requestId}::uuid, ${approve}, ${note}::text)`);
  } catch (e) {
    throw toDomainError(e);
  }
}

export async function evaluateLifecycle(tx: Tx, gam3yaId: string): Promise<string> {
  try {
    const rows = await tx.execute<{ status: string }>(sql`select app.evaluate_lifecycle(${gam3yaId}::uuid) as status`);
    return rows[0]!.status;
  } catch (e) {
    throw toDomainError(e);
  }
}
