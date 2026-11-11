import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { cookieOptions, decodeSessionCookie, encodeSessionCookie, ONE_YEAR, SESSION_COOKIE } from "@/lib/auth/cookie";

/** Server-side sign-out used when a deactivated account is detected. */
export async function GET(request: NextRequest) {
  const store = await cookies();
  const current = decodeSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (current.s) {
    try {
      await adminAuth().revokeRefreshTokens((await adminAuth().verifySessionCookie(current.s)).sub);
    } catch {
      /* already invalid */
    }
  }
  store.set(SESSION_COOKIE, encodeSessionCookie({ l: current.l }), cookieOptions(ONE_YEAR));
  const reason = request.nextUrl.searchParams.get("reason") === "deactivated" ? "?error=accountDeactivated" : "";
  return NextResponse.redirect(new URL(`/login${reason}`, request.nextUrl.origin));
}
