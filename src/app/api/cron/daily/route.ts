import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { runDailyJob } from "@/lib/notifications/job";

export const maxDuration = 60;

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = !!secret && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runDailyJob(getDb());
  return NextResponse.json({ ok: true, ...result });
}
