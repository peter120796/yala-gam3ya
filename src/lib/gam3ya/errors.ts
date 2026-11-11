import type { ValidationIssue } from "@/lib/engine/validate";
import { PolicyError } from "@/lib/data/policy";

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

/** Maps any failure to a safe, translatable code — internals never reach the client. */
export function toDomainError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  if (err instanceof PolicyError) return new DomainError(err.code);
  const e = err as { code?: number | string; name?: string };
  if (e?.name === "ZodError") return new DomainError("validation");
  if (e?.code === 6) return new DomainError("duplicate");
  if (e?.code === 5) return new DomainError("not_found");
  if (e?.code === 10) return new DomainError("conflict_retry");
  return new DomainError("unexpected_error");
}
