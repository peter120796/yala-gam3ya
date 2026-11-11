import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InviteUserDialog, UserRowActions } from "@/components/admin/user-actions";
import { requireAdmin } from "@/lib/auth/session";
import { listUsers } from "@/lib/admin/queries";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || null;
  const page = Math.max(0, Number(sp.page) || 0);
  const [t, locale] = [await getTranslations(), await getLocale()];
  const { rows, hasMore } = await listUsers(user.actor, q, page);
  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex w-full max-w-sm gap-2" role="search">
          <Input name="q" defaultValue={q ?? ""} placeholder={t("admin.searchUsers")} aria-label={t("admin.searchUsers")} />
          <Button type="submit" variant="outline">{t("common.search")}</Button>
        </form>
        <InviteUserDialog />
      </div>
      <Card>
        <CardContent className="pt-4">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.noResults")}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("settings.displayName")}</TH>
                  <TH>{t("admin.role")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH className="text-end">{t("admin.memberships")}</TH>
                  <TH>{t("admin.createdAt")}</TH>
                  <TH><span className="sr-only">{t("common.actions")}</span></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <div className="font-medium">{r.displayName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{r.email}</div>
                    </TD>
                    <TD>{t(`admin.roles.${r.role}` as "admin.roles.member")}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {r.isActive ? <Badge>{t("admin.active")}</Badge> : <Badge variant="danger">{t("admin.inactive")}</Badge>}
                        {r.approvalStatus !== "approved" && (
                          <Badge variant={r.approvalStatus === "pending" ? "warning" : "danger"}>{t(`approvals.${r.approvalStatus}` as "approvals.pending")}</Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="num text-end">{r.memberships}{r.organizes ? ` · ${r.organizes}★` : ""}</TD>
                    <TD className="text-xs">{new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(r.createdAt)}</TD>
                    <TD className="text-end">
                      {r.id !== user.userId && <UserRowActions userId={r.id} role={r.role as "member"} isActive={r.isActive} />}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <div className="mt-4 flex justify-between">
            {page > 0 ? <Link className="text-sm text-primary hover:underline" href={link(page - 1)}>{t("common.back")}</Link> : <span />}
            {hasMore ? <Link className="text-sm text-primary hover:underline" href={link(page + 1)}>{t("common.next")}</Link> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
