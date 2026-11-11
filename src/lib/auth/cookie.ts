/**
 * Single cookie, `__session` — Firebase hosting layers only forward a cookie
 * with this exact name. It carries the Firebase session cookie (`s`) and the
 * UI language (`l`), base64url-encoded JSON. httpOnly, Secure, SameSite=Lax.
 */
export const SESSION_COOKIE = "__session";

export interface SessionPayload {
  s?: string;
  l?: "ar" | "en";
}

export function decodeSessionCookie(raw: string | undefined | null): SessionPayload {
  if (!raw) return {};
  try {
    const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionPayload;
    return {
      s: typeof json.s === "string" && json.s.length < 3500 ? json.s : undefined,
      l: json.l === "en" || json.l === "ar" ? json.l : undefined,
    };
  } catch {
    return {};
  }
}

export function encodeSessionCookie(p: SessionPayload): string {
  return Buffer.from(JSON.stringify({ ...(p.s ? { s: p.s } : {}), ...(p.l ? { l: p.l } : {}) }), "utf8").toString("base64url");
}

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

export const ONE_YEAR = 60 * 60 * 24 * 365;
