import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Used when a deactivated account is detected server-side. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("reason") === "deactivated" ? "?error=accountDeactivated" : "";
  return NextResponse.redirect(new URL(`/login${reason}`, request.nextUrl.origin));
}
