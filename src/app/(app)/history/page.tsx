import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/money";
import { Gam3yaBadge } from "@/components/gam3ya/status-badge";
import { ExportButtons } from "@/components/gam3ya/export-buttons";
import { requireUser } from "@/lib/auth/session";
import { getMyGam3yas, getMyObligations, getMyPayouts } from "@/lib/data/reads";
import { sum } from "@/lib/engine/money";
import { formatCivilDate } from "@/lib/format";

export default async function HistoryPage() {
  const user = await requireUser();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const data = {
    gam3yas: (await getMyGam3yas(user.actor)).filter((g) => g.isMember && (g.gam3ya.status === "completed" || g.gam3ya.status === "cancelled")),
    obligations: await getMyObligations(user.actor),
    payouts: await getMyPayouts(user.actor),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t("history.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("history.subtitle")}</p>
        </div>
        <ExportButtons scope={{ kind: "member" }} />
      </div>
      {data.gam3yas.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">{t("history.empty")}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.gam3yas.map(({ gam3ya: g }) => {
            const totalIn = sum(data.obligations.filter((o) => o.gam3yaId === g.id).map((o) => o.amount));
            const totalOut = sum(data.payouts.filter((p) => p.gam3yaId === g.id).map((p) => p.amount));
            return (
              <Link key={g.id} href={`/gam3yas/${g.id}`} className="rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card className="p-5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-bold">{g.name}</h2>
                    <Gam3yaBadge status={g.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCivilDate(g.startDate, locale)} — {g.endDate ? formatCivilDate(g.endDate, locale) : "—"}
                  </p>
                  {g.completedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t("history.completedOn", { date: new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(g.completedAt)) })}
                    </p>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("history.totalContributions")}</dt>
                      <dd className="font-semibold"><Money value={totalIn} /></dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("history.totalPayouts")}</dt>
                      <dd className="font-semibold"><Money value={totalOut} /></dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
