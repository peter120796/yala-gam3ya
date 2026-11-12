import { NextResponse, type NextRequest } from "next/server";
import { decodeSessionCookie, SESSION_COOKIE } from "@/lib/auth/cookie";

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth/", "/legal", "/about", "/api/cron/", "/api/auth/"];

/**
 * Optimistic redirect for signed-out visitors (presence check only). The real
 * checks — session cookie verification, approval, roles — happen on the
 * server for every page, action and route.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))) return NextResponse.next();
  const { s } = decodeSessionCookie(request.cookies.get(SESSION_COOKIE)?.value);
  if (!s) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
