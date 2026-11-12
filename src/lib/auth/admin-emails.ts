import type { Role } from "@/lib/data/types";

/**
 * The admin area is locked to the emails in ADMIN_EMAILS (comma-separated,
 * server-only). A `super_admin` role on any other account is ignored and
 * treated as a regular member — fail closed if the variable is missing.
 */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().has(email.trim().toLowerCase());
}

/** Role as the app should honor it for this signed-in email. */
export function effectiveRole(role: Role, email: string | null | undefined): Role {
  return role === "super_admin" && !isAllowedAdminEmail(email) ? "member" : role;
}
