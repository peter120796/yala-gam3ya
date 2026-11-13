import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CommitmentsChart } from "@/components/gam3ya/commitments-chart";
import { requireAdmin } from "@/lib/auth/session";
import { getReports } from "@/lib/admin/queries";
import { todayIn } from "@/lib/engine/dates";
import { formatMonthKey, formatNumber } from "@/lib/format";

export default async function ReportsPage() {
  const user = await requireAdmin();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const r = await getReports(user.actor, todayIn());
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {r.byStatus.map((s) => (
          <Card key={s.status} className="p-4">
            <p className="text-xs text-muted-foreground">{t(`status.gam3ya.${s.status}` as "status.gam3ya.active")}</p>
            <p className="num mt-1 text-2xl font-bold">{formatNumber(s.n, locale)}</p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">%</p>
          <p className="num mt-1 text-2xl font-bold">{r.completionRate === null ? "—" : `${formatNumber(r.completionRate, locale)}%`}</p>
          <p className="text-xs text-muted-foreground">{t("status.gam3ya.completed")} / ({t("status.gam3ya.completed")} + {t("status.gam3ya.needs_closure")})</p>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.reports")}</CardTitle>
          <CardDescription>{t("admin.informational")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CommitmentsChart data={r.monthly.map((m) => ({ month: m.month, contributions: m.contributions, payouts: m.payouts }))} />
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("admin.users")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>{t("overview.month")}</TH><TH className="text-end">+</TH></TR></THead>
              <TBody>
                {r.growth.map((g) => <TR key={g.month}><TD>{formatMonthKey(g.month, locale)}</TD><TD className="num text-end">{formatNumber(g.users, locale)}</TD></TR>)}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("dashboard.recentActivity")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>{t("overview.month")}</TH><TH className="text-end">#</TH></TR></THead>
              <TBody>
                {r.monthly.map((m) => <TR key={m.month}><TD>{formatMonthKey(m.month, locale)}</TD><TD className="num text-end">{formatNumber(m.activity, locale)}</TD></TR>)}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
