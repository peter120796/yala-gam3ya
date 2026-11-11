import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildExport } from "@/lib/export/rows";
import { toCsv } from "@/lib/export/csv";
import { todayIn } from "@/lib/engine/dates";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive || user.approvalStatus !== "approved") return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  if (!rateLimit(`export:${user.userId}`, 20)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const scope = request.nextUrl.searchParams.get("scope") === "organizer" ? "organizer" : "member";
  const rawId = request.nextUrl.searchParams.get("gam3ya");
  const gam3yaId = rawId && /^[A-Za-z0-9_-]{1,128}$/.test(rawId) ? rawId : null;
  if (scope === "organizer" && !gam3yaId) return NextResponse.json({ error: "validation" }, { status: 400 });

  const t = await getTranslations();
  const table = await buildExport(user.actor, scope, gam3yaId, todayIn(), (k) => t(k as "common.date"));
  if (!table) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(toCsv(table.header, table.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="yala-gam3ya-${scope}-${todayIn()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
