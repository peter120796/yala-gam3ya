import "server-only";
import { z } from "zod";
import { getCurrentUser, asUser, type CurrentUser } from "@/lib/auth/session";
import type { Tx } from "@/lib/db/client";
import { DomainError, toDomainError } from "@/lib/gam3ya/errors";
import type { ValidationIssue } from "@/lib/engine/validate";
import { rateLimit } from "@/lib/rate-limit";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues?: ValidationIssue[]; fields?: Record<string, string[]> };

type Guard = "user" | "admin";

/**
 * Wraps a server action: validates input with Zod, authenticates, rate-limits,
 * runs the handler inside an RLS-scoped transaction and maps every failure to
 * a translatable error code (no internal details reach the client).
 */
export function defineAction<S extends z.ZodType, T>(
  schema: S,
  handler: (ctx: { user: CurrentUser; tx: Tx; input: z.infer<S> }) => Promise<T>,
  opts: { guard?: Guard; limit?: number; name: string },
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "validation", fields: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
    }
    const user = await getCurrentUser();
    if (!user || !user.isActive) return { ok: false, error: "not_authorized" };
    if (opts.guard === "admin" && (user.role !== "super_admin" || user.aal !== "aal2")) {
      return { ok: false, error: "not_authorized" };
    }
    if (!rateLimit(`${opts.name}:${user.userId}`, opts.limit ?? 60)) return { ok: false, error: "rate_limited" };
    try {
      const data = await asUser(user, (tx) => handler({ user, tx, input: parsed.data }));
      return { ok: true, data };
    } catch (e) {
      const err = toDomainError(e);
      if (err.code === "unexpected_error") console.error(`[action:${opts.name}]`, e);
      return { ok: false, error: err.code, issues: err instanceof DomainError ? err.issues : undefined };
    }
  };
}
