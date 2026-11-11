import { addDays, compareDates } from "@/lib/engine/dates";
import type { NotificationPrefs } from "@/lib/data/types";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/data/types";

export interface ReminderInput {
  today: string; // in the Gam3ya's timezone
  gam3ya: { id: string; name: string; status: string };
  obligations: { id: string; userId: string; dueDate: string; graceDays: number; recordStatus: string | null }[];
  payouts: { id: string; scheduledDate: string; recordStatus: string | null; isCurrent: boolean; recipientIds: string[] }[];
  prefs: Map<string, NotificationPrefs>;
  activeUsers: Set<string>;
}

export interface Reminder {
  userId: string;
  kind: string;
  gam3yaId: string;
  params: { gam3ya: string; date: string };
  dedupeKey: string;
}

/**
 * Date-based reminders (pure). Deterministic dedupe keys make the daily job
 * idempotent: re-running never creates duplicates.
 */
export function computeReminders(i: ReminderInput): Reminder[] {
  const out: Reminder[] = [];
  const { today, gam3ya } = i;
  if (gam3ya.status !== "active" && gam3ya.status !== "needs_closure") return out;
  const pref = (u: string) => i.prefs.get(u) ?? DEFAULT_NOTIFICATION_PREFS;

  for (const o of i.obligations) {
    if (o.recordStatus !== null || !i.activeUsers.has(o.userId) || !pref(o.userId).contributionReminders) continue;
    let kind: string | null = null;
    if (o.dueDate === addDays(today, 3)) kind = "contribution_due_3d";
    else if (o.dueDate === addDays(today, 1)) kind = "contribution_due_1d";
    else if (addDays(o.dueDate, o.graceDays) === addDays(today, -1)) kind = "contribution_overdue";
    if (kind) out.push({ userId: o.userId, kind, gam3yaId: gam3ya.id, params: { gam3ya: gam3ya.name, date: o.dueDate }, dedupeKey: `${kind}:${gam3ya.id}:${o.id}` });
  }

  if (gam3ya.status === "active") {
    const nextMonth = addDays(today.slice(0, 7) + "-01", 32).slice(0, 7);
    for (const p of i.payouts) {
      if (!p.isCurrent || p.recordStatus !== null) continue;
      let kind: string | null = null;
      if (compareDates(p.scheduledDate, today) >= 0 && compareDates(p.scheduledDate, addDays(today, 6)) <= 0) kind = "payout_this_week";
      else if (p.scheduledDate.slice(0, 7) === nextMonth) kind = "payout_next_month";
      if (!kind) continue;
      for (const u of p.recipientIds) {
        if (!i.activeUsers.has(u) || !pref(u).payoutReminders) continue;
        out.push({ userId: u, kind, gam3yaId: gam3ya.id, params: { gam3ya: gam3ya.name, date: p.scheduledDate }, dedupeKey: `${kind}:${gam3ya.id}:${p.id}:${u}` });
      }
    }
  }
  return out;
}
