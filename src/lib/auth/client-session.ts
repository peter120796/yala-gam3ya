"use client";
import { signOut, type User } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";

/** Exchanges the fresh ID token for the server's httpOnly session cookie. */
export async function establishSession(user: User, mode: "signin" | "signup", extra: { next?: string; displayName?: string; phone?: string } = {}) {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, mode, ...extra }),
  });
  const body = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "invalidCredentials");
  return body.next ?? "/";
}

export async function signOutEverywhere(locale: string) {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  await signOut(clientAuth(locale)).catch(() => {});
}

/** Maps Firebase Auth error codes to our translation keys (no account enumeration). */
export function authErrorKey(e: unknown): string {
  const code = (e as { code?: string; message?: string }).code ?? (e as Error).message;
  switch (code) {
    case "auth/too-many-requests":
    case "rateLimited":
      return "rateLimited";
    case "auth/user-disabled":
    case "accountDeactivated":
      return "accountDeactivated";
    case "auth/invalid-verification-code":
    case "auth/invalid-mfa-code":
      return "mfaInvalid";
    case "auth/weak-password":
      return "passwordRules";
    default:
      return "invalidCredentials";
  }
}
