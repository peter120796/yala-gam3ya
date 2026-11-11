import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PublishPolicyForm } from "@/components/admin/publish-policy-form";
import { requireAdmin } from "@/lib/auth/session";
import { listPolicies } from "@/lib/admin/queries";
import { formatInstant } from "@/lib/format";

export default async function PoliciesPage() {
  const user = await requireAdmin();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const rows = await listPolicies(user.actor);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="pt-4">
          <Table>
            <THead><TR><TH>{t("admin.policyKind")}</TH><TH>{t("admin.policyVersion")}</TH><TH>{t("common.date")}</TH><TH /></TR></THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD>{t(`legal.${p.kind}` as "legal.terms")}</TD>
                  <TD><code dir="ltr">{p.version}</code>{p.summary ? <div className="text-xs text-muted-foreground">{p.summary}</div> : null}</TD>
                  <TD className="text-xs">{formatInstant(p.effectiveAt, locale)}</TD>
                  <TD>{p.isCurrent && <Badge>{t("admin.current")}</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("admin.publishPolicy")}</CardTitle></CardHeader>
        <CardContent><PublishPolicyForm /></CardContent>
      </Card>
    </div>
  );
}
