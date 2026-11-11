import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";
import { decodeSessionCookie, SESSION_COOKIE } from "@/lib/auth/cookie";

/** Locale lives in the single `__session` cookie (Firebase only forwards that one). */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = decodeSessionCookie(store.get(SESSION_COOKIE)?.value).l ?? defaultLocale;
  return {
    locale,
    timeZone: "Africa/Cairo",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
