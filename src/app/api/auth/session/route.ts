import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/admin";
import { ensureProfile } from "@/lib/data/users";
import { cookieOptions, decodeSessionCookie, encodeSessionCookie, ONE_YEAR, SESSION_COOKIE } from "@/lib/auth/cookie";
import { rateLimit } from "@/lib/rate-limit";
import { effectiveRole } from "@/lib/auth/admin-emails";
import { publicEnv } from "@/lib/env";

const body = z.object({
  idToken: z.string().min(20).max(5000),
  mode: z.enum(["signin", "signup"]),
  next: z.string().max(300).optional(),
  displayName: z.string().trim().min(2).max(80).optional(),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^(\+?20|0)?1[0125]\d{8}$/.test(v))
    .optional(),
});

/**
 * Same-origin check — the session endpoint must not be callable cross-site.
 * Accepts the host the request came in on, or the public site address
 * (the short Firebase Hosting domain proxies to App Hosting).
 */
async function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const h = await headers();
  const allowed = new Set([h.get("x-forwarded-host"), req.headers.get("host"), siteHost()].filter(Boolean));
  return allowed.has(originHost);
}

function siteHost() {
  try {
    return new URL(publicEnv.siteUrl).host;
  } catch {
    return null;
  }
}

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/");

/**
 * Exchanges a fresh Firebase ID token for an httpOnly session cookie.
 * Members: 5 days. Super admins: 12 hours.
 */
export async function POST(req: NextRequest) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`session:${ip}`, 20)) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "signupInvalid" }, { status: 400 });

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);
  } catch {
    return NextResponse.json({ error: "invalidCredentials" }, { status: 401 });
  }
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return NextResponse.json({ error: "invalidCredentials" }, { status: 401 });

  const store = await cookies();
  const current = decodeSessionCookie(store.get(SESSION_COOKIE)?.value);
  const profile = await ensureProfile(decoded.uid, {
    email: decoded.email ?? null,
    displayName: parsed.data.displayName ?? (decoded.name as string | undefined) ?? null,
    phone: parsed.data.phone || null,
    locale: current.l ?? "ar",
  });
  if (!profile.isActive) return NextResponse.json({ error: "accountDeactivated" }, { status: 403 });

  const isAdmin = effectiveRole(profile.role, decoded.email) === "super_admin";
  const expiresIn = (isAdmin ? 12 * 60 * 60 : 5 * 24 * 60 * 60) * 1000;
  const sessionCookie = await adminAuth().createSessionCookie(parsed.data.idToken, { expiresIn });
  store.set(SESSION_COOKIE, encodeSessionCookie({ s: sessionCookie, l: profile.locale ?? current.l }), cookieOptions(Math.max(expiresIn / 1000, ONE_YEAR)));

  const mfa = Boolean((decoded.firebase as { sign_in_second_factor?: string }).sign_in_second_factor);
  const next =
    profile.approvalStatus !== "approved" ? "/pending" : isAdmin && !mfa ? "/mfa" : safeNext(parsed.data.next);
  return NextResponse.json({ ok: true, next });
}

/** Sign out: revoke refresh tokens and drop the session (keep the language). */
export async function DELETE(req: NextRequest) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const store = await cookies();
  const current = decodeSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (current.s) {
    try {
      const d = await adminAuth().verifySessionCookie(current.s);
      await adminAuth().revokeRefreshTokens(d.sub);
    } catch {
      /* already invalid */
    }
  }
  store.set(SESSION_COOKIE, encodeSessionCookie({ l: current.l }), cookieOptions(ONE_YEAR));
  return NextResponse.json({ ok: true });
}
