import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { notificationPreferences, notifications, profiles, userPreferences } from "@/lib/db/schema";
import { getEmailProvider } from "./provider";
import { renderNotification } from "./render";
import { publicEnv } from "@/lib/env";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Daily job (trusted system context): lifecycle evaluation → reminders →
 * email delivery. Every step is idempotent, so retries and overlaps are safe.
 */
export async function runDailyJob(db: Db) {
  const lifecycle = await db.transaction(async (tx) => {
    const ids = (await tx.execute(sql`select id from public.gam3yas where status in ('active','needs_closure')`)) as unknown as { id: string }[];
    for (const { id } of ids) await tx.execute(sql`select app.apply_lifecycle(${id}::uuid)`);
    return ids.length;
  });

  const created = await db.transaction(async (tx) => {
    const [r] = (await tx.execute(sql`select app.generate_reminders() as n`)) as unknown as { n: number }[];
    return Number(r?.n ?? 0);
  });

  const provider = getEmailProvider();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  // Claim a batch atomically so concurrent runs never email the same row twice.
  const batch = await db.transaction(async (tx) => {
    return (await tx.execute(sql`
      update public.notifications n set email_status = 'sending'
      where n.id in (select id from public.notifications where email_status = 'pending' order by created_at limit 200 for update skip locked)
      returning n.id
    `)) as unknown as { id: string }[];
  }).catch(async () => [] as { id: string }[]);

  if (batch.length) {
    const rows = await db
      .select({
        n: notifications,
        email: profiles.email,
        active: profiles.isActive,
        locale: userPreferences.locale,
        emailEnabled: notificationPreferences.emailEnabled,
        updates: notificationPreferences.gam3yaUpdates,
      })
      .from(notifications)
      .innerJoin(profiles, eq(profiles.id, notifications.userId))
      .leftJoin(userPreferences, eq(userPreferences.userId, notifications.userId))
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, notifications.userId))
      .where(inArray(notifications.id, batch.map((b) => b.id)));

    for (const r of rows) {
      const isUpdate = r.n.kind.startsWith("gam3ya_") || r.n.kind === "payout_marked_completed";
      const wants = r.active && r.email && (r.emailEnabled ?? true) && (!isUpdate || (r.updates ?? true));
      let status: "sent" | "skipped" | "failed" = "skipped";
      if (wants) {
        const locale = r.locale === "en" ? "en" : "ar";
        const m = renderNotification(r.n.kind, r.n.params, locale);
        const dir = locale === "ar" ? "rtl" : "ltr";
        const link = r.n.gam3yaId ? `${publicEnv.siteUrl}/gam3yas/${r.n.gam3yaId}` : publicEnv.siteUrl;
        const res = await provider.send({
          to: r.email!,
          subject: `${m.subject} — ${m.appName}`,
          text: `${m.text}\n\n${link}\n\n${m.footer}`,
          html: `<div dir="${dir}" style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6"><p>${escapeHtml(m.text)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(m.appName)}</a></p><p style="color:#64748b;font-size:12px">${escapeHtml(m.footer)}</p></div>`,
        });
        status = res.ok ? "sent" : "failed";
      }
      if (status === "sent") sent++;
      else if (status === "failed") failed++;
      else skipped++;
      await db
        .update(notifications)
        .set({ emailStatus: status, emailedAt: status === "sent" ? new Date() : null })
        .where(and(eq(notifications.id, r.n.id), eq(notifications.emailStatus, "sending")));
    }
  }
  return { lifecycle, created, email: { provider: provider.name, sent, skipped, failed } };
}
