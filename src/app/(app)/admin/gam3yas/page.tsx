import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Gam3yaBadge } from "@/components/gam3ya/status-badge";
import { Money } from "@/components/money";
import { RestoreButton } from "@/components/admin/restore-button";
import { requireAdmin } from "@/lib/auth/session";
import { listGam3yas } from "@/lib/admin/queries";
import { formatCivilDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES = ["draft", "active", "needs_closure", "completed", "cancelled"] as const;

export default async function AdminGam3yasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status! : null;
  const [t, locale] = [await getTranslations(), await getLocale()];
  const rows = await listGam3yas(user.actor, status);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[null, ...STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={s ? `/admin/gam3yas?status=${s}` : "/admin/gam3yas"}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {s ? t(`status.gam3ya.${s}`) : t("admin.allStatuses")}
            </Link>
          ))}
        </div>
        <Button asChild>
          <Link href="/admin/gam3yas/new"><Plus /> {t("admin.newGam3ya")}</Link>
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.noResults")}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("export.gam3ya")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t("gam3ya.organizer")}</TH>
                  <TH className="text-end">{t("gam3ya.contributionPerShare")}</TH>
                  <TH className="text-end">{t("gam3ya.totalShares")}</TH>
                  <TH>{t("gam3ya.startDate")}</TH>
                  <TH><span className="sr-only">{t("common.actions")}</span></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(({ g, organizers, members }) => (
                  <TR key={g.id}>
                    <TD>
                      <Link href={g.status === "draft" ? `/admin/gam3yas/${g.id}` : `/gam3yas/${g.id}`} className="font-medium hover:underline">{g.name}</Link>
                      <div className="text-xs text-muted-foreground">{members} {t("admin.memberships")}</div>
                    </TD>
                    <TD><Gam3yaBadge status={g.status} /></TD>
                    <TD className="text-sm">{organizers.join("، ")}</TD>
                    <TD className="text-end"><Money value={g.contributionPerShare} /></TD>
                    <TD className="num text-end">{g.totalShares}</TD>
                    <TD className="text-sm">{formatCivilDate(g.startDate, locale)}</TD>
                    <TD className="text-end">
                      {g.status === "draft" ? (
                        <Button asChild size="sm" variant="outline"><Link href={`/admin/gam3yas/${g.id}`}>{t("common.edit")}</Link></Button>
                      ) : g.status === "completed" ? (
                        <RestoreButton id={g.id} />
                      ) : null}
                    </TD>
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
