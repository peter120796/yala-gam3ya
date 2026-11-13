import "server-only";
import { todayIn } from "@/lib/engine/dates";
import { evaluateLifecycle } from "@/lib/data/gam3yas";
import { ensureInitialPolicies } from "@/lib/data/policies";
import { bulk, notificationDoc, refs } from "@/lib/data/store";
import type { Gam3yaDoc, NotificationDoc, ObligationDoc, PayoutDoc, UserDoc } from "@/lib/data/types";
import { usersByIds } from "@/lib/data/users";
import { db } from "@/lib/firebase/admin";
import { publicEnv } from "@/lib/env";
import { getEmailProvider } from "./provider";
import { computeReminders } from "./reminders";
import { renderNotification } from "./render";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Daily job (trusted system context): lifecycle → reminders → email.
 * Every step is idempotent (deterministic notification ids, claim-before-send),
 * so retries and overlapping runs are safe.
 */
export async function runDailyJob() {
  await ensureInitialPolicies();

  const gam3yas = (await refs.gam3yas().where("status", "in", ["active", "needs_closure"]).get()).docs.map((d) => ({ id: d.id, ...(d.data() as Gam3yaDoc) }));
  let lifecycle = 0;
  let created = 0;
  for (const g of gam3yas) {
    const next = await evaluateLifecycle(null, g.id, true);
    if (next !== g.status) lifecycle++;
    if (next !== "active" && next !== "needs_closure") continue;
    const [obs, pays, people] = await Promise.all([
      refs.obligations(g.id).where("recordStatus", "==", null).get(),
      refs.payouts(g.id).where("isCurrent", "==", true).get(),
      usersByIds(g.memberIds),
    ]);
    const reminders = computeReminders({
      today: todayIn(g.timezone),
      gam3ya: { id: g.id, name: g.name, status: next },
      obligations: obs.docs.map((d) => ({ id: d.id, ...(d.data() as ObligationDoc) })),
      payouts: pays.docs.map((d) => ({ id: d.id, ...(d.data() as PayoutDoc) })),
      prefs: new Map([...people].map(([id, u]) => [id, u.notificationPrefs])),
      activeUsers: new Set([...people].filter(([, u]) => u.isActive && u.approvalStatus === "approved" && u.signupSource !== "guest").map(([id]) => id)),
    });
    if (!reminders.length) continue;
    const existing = await db().getAll(...reminders.map((r) => refs.notification(r.dedupeKey)));
    const w = bulk();
    reminders.forEach((r, i) => {
      if (existing[i]!.exists) return;
      created++;
      void w.create(refs.notification(r.dedupeKey), notificationDoc(r));
    });
    await w.close();
  }

  // Email delivery: claim each pending row in a transaction so concurrent runs never double-send.
  const provider = getEmailProvider();
  const stats = { provider: provider.name, sent: 0, skipped: 0, failed: 0 };
  const pending = await refs.notifications().where("emailStatus", "==", "pending").limit(200).get();
  const people = await usersByIds(pending.docs.map((d) => (d.data() as NotificationDoc).userId));
  for (const d of pending.docs) {
    const claimed = await db().runTransaction(async (tx) => {
      const cur = await tx.get(d.ref);
      if (!cur.exists || (cur.data() as NotificationDoc).emailStatus !== "pending") return false;
      tx.update(d.ref, { emailStatus: "sending" });
      return true;
    });
    if (!claimed) continue;
    const n = d.data() as NotificationDoc;
    const u = people.get(n.userId) as UserDoc | undefined;
    const isUpdate = n.kind.startsWith("gam3ya_") || n.kind === "payout_marked_completed";
    const wants = !!u && u.isActive && !!u.email && u.notificationPrefs?.emailEnabled !== false && (!isUpdate || u.notificationPrefs?.gam3yaUpdates !== false);
    let status: NotificationDoc["emailStatus"] = "skipped";
    if (wants) {
      const locale = u!.locale === "en" ? "en" : "ar";
      const m = renderNotification(n.kind, n.params, locale);
      const dir = locale === "ar" ? "rtl" : "ltr";
      const link = n.gam3yaId ? `${publicEnv.siteUrl}/gam3yas/${n.gam3yaId}` : publicEnv.siteUrl;
      const res = await provider.send({
        to: u!.email!,
        subject: `${m.subject} — ${m.appName}`,
        text: `${m.text}\n\n${link}\n\n${m.footer}`,
        html: `<div dir="${dir}" style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6"><p>${escapeHtml(m.text)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(m.appName)}</a></p><p style="color:#64748b;font-size:12px">${escapeHtml(m.footer)}</p></div>`,
      });
      status = res.ok ? "sent" : "failed";
    }
    stats[status === "sent" ? "sent" : status === "failed" ? "failed" : "skipped"]++;
    await d.ref.update({ emailStatus: status, emailedAt: status === "sent" ? new Date().toISOString() : null });
  }
  return { lifecycle, created, email: stats };
}
