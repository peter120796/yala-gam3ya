import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { listAudit } from "@/lib/admin/queries";
import { formatInstant } from "@/lib/format";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireAdmin();
  const page = Math.max(0, Number((await searchParams).page) || 0);
  const [t, locale] = [await getTranslations("admin"), await getLocale()];
  const { rows, hasMore } = await listAudit(user.actor, page);
  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <THead>
            <TR>
              <TH>{t("auditWhen")}</TH>
              <TH>{t("auditActor")}</TH>
              <TH>{t("auditAction")}</TH>
              <TH>{t("auditEntity")}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map(({ a, actor, gam3yaName }) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs">{formatInstant(a.createdAt, locale)}</TD>
                <TD className="text-sm">{actor ?? "system"}</TD>
                <TD><code className="text-xs" dir="ltr">{a.action}</code>{a.reason ? <div className="text-xs text-muted-foreground">{a.reason}</div> : null}</TD>
                <TD className="text-xs">
                  {a.entityType}
                  {gam3yaName ? <> · {a.gam3yaId ? <Link className="hover:underline" href={`/gam3yas/${a.gam3yaId}`}>{gam3yaName}</Link> : gam3yaName}</> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="mt-4 flex justify-between text-sm">
          {page > 0 ? <Link className="text-primary hover:underline" href={`/admin/audit?page=${page - 1}`}>←</Link> : <span />}
          {hasMore ? <Link className="text-primary hover:underline" href={`/admin/audit?page=${page + 1}`}>→</Link> : null}
        </div>
      </CardContent>
    </Card>
  );
}
