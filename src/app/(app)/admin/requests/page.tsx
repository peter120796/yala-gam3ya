import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewButtons } from "@/components/admin/review-buttons";
import { asUser, requireAdmin } from "@/lib/auth/session";
import { listPendingRequests } from "@/lib/admin/queries";
import { formatInstant } from "@/lib/format";

export default async function RequestsPage() {
  const user = await requireAdmin();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const rows = await asUser(user, (tx) => listPendingRequests(tx));
  if (rows.length === 0) return <Card className="p-10 text-center text-muted-foreground">{t("admin.noRequests")}</Card>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ r, gam3yaName, proposer }) => (
        <Card key={r.id}>
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href={`/gam3yas/${r.gam3yaId}`} className="font-semibold hover:underline">{gam3yaName}</Link>
              <p className="text-sm">{t("manage.swapShares", { a: r.shareA, b: r.shareB })}</p>
              <p className="text-sm text-muted-foreground">“{r.reason}” — {proposer} · {formatInstant(r.createdAt, locale)}</p>
            </div>
            <ReviewButtons id={r.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
