import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarClock, CheckCircle2, Layers, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/gam3ya/kpi-card";
import { Gam3yaBadge } from "@/components/gam3ya/status-badge";
import { Money } from "@/components/money";
import { asUser, requireAdmin } from "@/lib/auth/session";
import { getAdminOverview, getNeedsAction } from "@/lib/admin/queries";
import { todayIn } from "@/lib/engine/dates";

export default async function AdminOverviewPage() {
  const user = await requireAdmin();
  const t = await getTranslations();
  const today = todayIn();
  const { stats, needs } = await asUser(user, async (tx) => ({ stats: await getAdminOverview(tx, today), needs: await getNeedsAction(tx, today) }));
  const attention = needs.filter((n) => n.status === "needs_closure" || n.overdue > 0 || n.reported > 0 || n.late_payouts > 0);
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label={t("admin.totalUsers")} value={<span className="num">{stats.total_users}</span>} icon={<Users />} />
        <KpiCard label={t("admin.activeUsers")} value={<span className="num">{stats.active_users}</span>} icon={<UserCheck />} />
        <KpiCard label={t("admin.activeGam3yas")} value={<span className="num">{stats.active_gam3yas}</span>} icon={<Layers />} />
        <KpiCard label={t("admin.completedGam3yas")} value={<span className="num">{stats.completed_gam3yas}</span>} icon={<CheckCircle2 />} />
        <KpiCard label={t("admin.upcomingPayouts")} value={<span className="num">{stats.upcoming_payouts}</span>} hint={<Money value={stats.upcoming_payouts_amount ?? 0} />} icon={<CalendarClock />} />
        <KpiCard label={t("admin.overdueContributions")} value={<span className="num">{stats.overdue_contributions}</span>} icon={<AlertTriangle />} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.needsAction")}</CardTitle>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.noResults")}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("export.gam3ya")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH className="text-end">{t("status.contribution.overdue")}</TH>
                  <TH className="text-end">{t("status.contribution.reported_paid")}</TH>
                  <TH className="text-end">{t("status.payout.delayed")}</TH>
                </TR>
              </THead>
              <TBody>
                {attention.map((n) => (
                  <TR key={n.id}>
                    <TD><Link href={`/gam3yas/${n.id}`} className="font-medium hover:underline">{n.name}</Link></TD>
                    <TD><Gam3yaBadge status={n.status} /></TD>
                    <TD className="num text-end">{n.overdue}</TD>
                    <TD className="num text-end">{n.reported}</TD>
                    <TD className="num text-end">{n.late_payouts}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
