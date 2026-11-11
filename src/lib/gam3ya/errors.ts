import type { ValidationIssue } from "@/lib/engine/validate";

/** Domain error with a stable code that the UI translates. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly issues: ValidationIssue[] = [],
  ) {
    super(code);
    this.name = "DomainError";
  }
}

const SQLSTATE: Record<string, string> = {
  "42501": "not_authorized",
  "23514": "invalid_operation",
  "23505": "duplicate",
  "23503": "invalid_reference",
  P0002: "not_found",
};

/**
 * Maps database errors to safe, translatable codes. Never leaks SQL details to
 * the client; known activation codes (raised by app.activate_gam3ya) pass through.
 */
export function toDomainError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e.cause?.code ?? e.code;
  const message = e.cause?.message ?? e.message ?? "";
  const known = /^(ACTIVATION_[A-Z_]+|CHANGE_[A-Z_]+)$/.exec(message.trim());
  if (known) return new DomainError(known[1]!.toLowerCase());
  if (/reason is required/.test(message)) return new DomainError("reason_required");
  if (/read-only/.test(message)) return new DomainError("archived_read_only");
  if (/status unchanged/.test(message)) return new DomainError("status_unchanged");
  return new DomainError((code && SQLSTATE[code]) || "unexpected_error");
}
