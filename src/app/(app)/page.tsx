import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowUpRight, CalendarClock, HandCoins, Layers, Lightbulb, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/gam3ya/kpi-card";
import { CommitmentsChart } from "@/components/gam3ya/commitments-chart";
import { ContributionBadge, Gam3yaBadge } from "@/components/gam3ya/status-badge";
import { Money } from "@/components/money";
import { asUser, requireUser } from "@/lib/auth/session";
import { getMyGam3yas, getMyObligations, getMyPayouts, getRecentActivity, getUnreadNotifications } from "@/lib/gam3ya/queries";
import { addMonthsToKey, diffDays, monthKey, monthRange, todayIn } from "@/lib/engine/dates";
import { sum } from "@/lib/engine/money";
import { nextPayout, projection, summarizeMonth, upcomingContributions, contributionStatusOf } from "@/lib/engine/summary";
import { formatCivilDate, formatInstant, formatMonthKey, relativeWhen } from "@/lib/format";
import { renderNotification } from "@/lib/notifications/render";

export default async function DashboardPage() {
  const user = await requireUser();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const today = todayIn();
  const month = monthKey(today);

  const data = await asUser(user, async (tx) => ({
    gam3yas: await getMyGam3yas(tx, user.userId),
    obligations: await getMyObligations(tx, user.userId),
    payouts: await getMyPayouts(tx, user.userId),
    notifications: await getUnreadNotifications(tx, user.userId, 5),
    activity: await getRecentActivity(tx, user.userId, 6),
  }));

  const summary = summarizeMonth(month, data.obligations, data.payouts, today);
  const memberGam3yas = data.gam3yas.filter((g) => g.membershipId);
  const active = memberGam3yas.filter((g) => g.gam3ya.status === "active" || g.gam3ya.status === "needs_closure");
  const next = nextPayout(data.payouts, today);
  const deadlines = upcomingContributions(data.obligations, today, 5);
  const chart = projection(month, 12, data.obligations, data.payouts);
  const overdue = data.obligations.filter((o) => contributionStatusOf(o, today) === "overdue");

  // Insights — plain arithmetic over real records.
  const nextMonth = addMonthsToKey(month, 1);
  const nextMonthTotal = summarizeMonth(nextMonth, data.obligations, data.payouts, today).scheduledContributions;
  const qStartMonth = Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1;
  const qEnd = monthRange(`${month.slice(0, 4)}-${String(qStartMonth + 2).padStart(2, "0")}`).end;
  const endingThisQuarter = active.filter((g) => g.gam3ya.endDate && g.gam3ya.endDate >= today && g.gam3ya.endDate <= qEnd).length;

  const progressOf = (gid: string) => {
    const mine = data.obligations.filter((o) => o.gam3yaId === gid);
    const cycles = new Set(mine.map((o) => o.cycleNumber)).size;
    const elapsed = new Set(mine.filter((o) => o.dueDate <= today).map((o) => o.cycleNumber)).size;
    return { cycles, elapsed };
  };
  const myMonthly = (gid: string) => {
    const first = data.obligations.find((o) => o.gam3yaId === gid);
    return first?.amount ?? 0;
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          {locale === "ar" ? t("dashboard.greeting") : `${t("dashboard.greeting").replace(" 👋", "")}, ${user.displayName} 👋`}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("dashboard.subtitle")}</p>
      </section>

      {overdue.length > 0 && (
        <Alert variant="danger">
          <AlertTriangle />
          <span>
            {t.rich("dashboard.overdueBanner", {
              count: overdue.length,
              amount: () => <Money value={sum(overdue.map((o) => o.amount))} className="font-semibold" />,
            })}
          </span>
        </Alert>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t("dashboard.subtitle")}>
        <KpiCard
          accent
          label={t("dashboard.kpiContributions")}
          value={<Money value={summary.scheduledContributions} />}
          icon={<Wallet />}
          hint={summary.recordedPaidContributions > 0 ? <>{t("overview.recordedPaid")}: <Money value={summary.recordedPaidContributions} /></> : null}
        />
        <KpiCard label={t("dashboard.kpiPayouts")} value={<Money value={summary.expectedPayouts} />} icon={<HandCoins />} />
        <KpiCard label={t("dashboard.kpiActive")} value={<span className="num">{new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en").format(active.length)}</span>} icon={<Layers />} />
        <KpiCard
          label={t("dashboard.kpiNextPayout")}
          value={next ? formatMonthKey(monthKey(next.payoutDate), locale) : <span className="text-base font-medium text-muted-foreground">{t("dashboard.noUpcomingPayout")}</span>}
          hint={next ? <><Money value={next.amount} /> · {next.gam3yaName}</> : null}
          icon={<CalendarClock />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("dashboard.upcomingDeadlines")}</CardTitle>
              <Link href="/overview" className="text-sm font-medium text-primary hover:underline">{t("common.viewAll")}</Link>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("dashboard.noDeadlines")}</p>
              ) : (
                <ul className="divide-y">
                  {deadlines.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link href={`/gam3yas/${d.gam3yaId}`} className="block truncate font-medium hover:underline">{d.gam3yaName}</Link>
                        <span className="text-xs text-muted-foreground">
                          {t("gam3ya.cycleN", { n: d.cycleNumber })} · {t("dashboard.dueOn", { date: formatCivilDate(d.dueDate, locale) })}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Money value={d.amount} className="font-semibold" />
                        <ContributionBadge status={d.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="my-gam3yas">
            <h2 id="my-gam3yas" className="mb-3 text-lg font-bold">{t("dashboard.activeGam3yas")}</h2>
            {data.gam3yas.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="font-medium">{t("dashboard.noGam3yas")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.noGam3yasHint")}</p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.gam3yas
                  .filter((g) => g.gam3ya.status !== "completed" && g.gam3ya.status !== "cancelled")
                  .map(({ gam3ya: g, shares, isOrganizer, membershipId }) => {
                    const p = progressOf(g.id);
                    const myTurn = data.payouts.find((x) => x.gam3yaId === g.id && x.payoutDate >= today);
                    return (
                      <Link key={g.id} href={`/gam3yas/${g.id}`} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-bold">{g.name}</h3>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Gam3yaBadge status={g.status} />
                                {isOrganizer && <Badge variant="info">{t("gam3ya.organizer")}</Badge>}
                              </div>
                            </div>
                            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                          </div>
                          {membershipId && (
                            <div className="mt-4 flex items-baseline justify-between">
                              <Money value={myMonthly(g.id)} className="text-lg font-bold" />
                              <span className="text-xs text-muted-foreground">
                                {shares.map((s) => (s.portionBp === 5000 ? `½ ${t("gam3ya.share")} ${s.shareNumber}` : `${t("gam3ya.share")} ${s.shareNumber}`)).join("، ")}
                              </span>
                            </div>
                          )}
                          {p.cycles > 0 && (
                            <div className="mt-4">
                              <Progress value={(p.elapsed / p.cycles) * 100} aria-label={t("dashboard.cyclesProgress", { done: p.elapsed, total: p.cycles })} />
                              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                <span>{t("dashboard.cyclesProgress", { done: p.elapsed, total: p.cycles })}</span>
                                {myTurn && <span>{t("dashboard.turnIn", { date: formatCivilDate(myTurn.payoutDate, locale, "short") })}</span>}
                              </div>
                            </div>
                          )}
                        </Card>
                      </Link>
                    );
                  })}
              </div>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.monthlyChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CommitmentsChart data={chart} />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          {next && (
            <Card className="overflow-hidden">
              <div className="bg-accent p-5 text-accent-foreground">
                <p className="text-sm font-medium">{t("dashboard.countdown")}</p>
                <p className="mt-1 text-3xl font-extrabold">{t("dashboard.days", { count: Math.max(0, diffDays(next.payoutDate, today)) })}</p>
                <p className="mt-2 text-sm">
                  {next.gam3yaName} · {formatCivilDate(next.payoutDate, locale)}
                </p>
                <Money value={next.amount} className="mt-1 block text-lg font-bold" />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-brand" /> {t("dashboard.insights")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  {t.rich("dashboard.insightNextMonth", { amount: () => <Money value={nextMonthTotal} className="font-semibold" /> })}
                </li>
                {next && (
                  <li>
                    {t("dashboard.insightPayoutIn", { when: relativeWhen(diffDays(next.payoutDate, today), locale) })}
                  </li>
                )}
                {endingThisQuarter > 0 && <li>{t("dashboard.insightEndingQuarter", { count: endingThisQuarter })}</li>}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("dashboard.notifications")}</CardTitle>
              <Link href="/notifications" className="text-sm font-medium text-primary hover:underline">{t("common.viewAll")}</Link>
            </CardHeader>
            <CardContent>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("dashboard.noNotifications")}</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {data.notifications.map((n) => (
                    <li key={n.id} className="border-s-2 border-brand ps-3">
                      {renderNotification(n.kind, n.params, locale === "en" ? "en" : "ar").text}
                      <div className="text-xs text-muted-foreground">{formatInstant(n.createdAt, locale)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
              <CardDescription>{t("disclaimer.statuses")}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("dashboard.noActivity")}</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {data.activity.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-2">
                      <span>
                        <Link href={`/gam3yas/${a.gam3yaId}`} className="font-medium hover:underline">{a.gam3yaName}</Link>
                        <span className="text-muted-foreground"> · {t("gam3ya.cycleN", { n: a.cycleNumber })}</span>
                        <div className="text-xs text-muted-foreground">{formatInstant(a.createdAt, locale)}</div>
                      </span>
                      {a.toStatus ? <ContributionBadge status={a.toStatus as "recorded_paid"} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
