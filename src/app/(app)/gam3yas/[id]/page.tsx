import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { ContributionBadge, Gam3yaBadge, PayoutBadge } from "@/components/gam3ya/status-badge";
import { MemberActions } from "@/components/gam3ya/member-actions";
import { ManagePanel } from "@/components/gam3ya/manage-panel";
import { ExportButtons } from "@/components/gam3ya/export-buttons";
import { requireUser } from "@/lib/auth/session";
import { getGam3yaForViewer, getManageData, getMyObligations, getMyPayouts, getOrganizerNames, getTurns } from "@/lib/data/reads";
import { canManage } from "@/lib/data/policy";
import { todayIn, compareDates } from "@/lib/engine/dates";
import { multiply, sum } from "@/lib/engine/money";
import { currentCycleNumber, cyclesElapsed } from "@/lib/engine/status";
import { contributionStatusOf, payoutStatusOf, remainingInstallments } from "@/lib/engine/summary";
import { formatCivilDate } from "@/lib/format";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

export default async function Gam3yaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const user = await requireUser();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const today = todayIn();

  const g0 = await getGam3yaForViewer(user.actor, id);
  if (!g0 || g0.status === "draft") notFound();
  const manage = canManage(user.actor, g0);
  const [organizers, turns0, obligations0, payouts0, manageData] = await Promise.all([
    getOrganizerNames(g0),
    getTurns(user.actor, g0),
    getMyObligations(user.actor, id),
    getMyPayouts(user.actor, id),
    manage ? getManageData(user.actor, id) : Promise.resolve(null),
  ]);
  const data = { g: g0, manage, organizers, turns: turns0, obligations: obligations0, payouts: payouts0, manageData, pending: manageData?.pending ?? [] };

  const { g, turns, obligations, payouts } = data;

  const dueDates = [...new Set(turns.map((x) => x.scheduled_date))].sort(compareDates);
  const elapsed = cyclesElapsed(dueDates, today);
  const completed = turns.filter((x) => x.is_completed).length;
  const current = turns.find((x) => x.cycle_number === currentCycleNumber(dueDates, today));
  const nextObligation = obligations.find((o) => o.record !== "recorded_paid" && o.record !== "waived" && compareDates(o.dueDate, today) >= 0);
  const remaining = remainingInstallments(obligations);
  const pot = multiply(g.contributionPerShare, g.totalShares);
  const myTotalIn = sum(obligations.map((o) => o.amount));
  const myTotalOut = sum(payouts.map((p) => p.amount));
  const readOnly = g.status === "completed";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4 ltr:rotate-180" /> {t("gam3ya.back")}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{g.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("gam3ya.organizer")}: {data.organizers.join("، ") || "—"}
            </p>
            {g.description ? <p className="mt-2 max-w-prose text-sm">{g.description}</p> : null}
          </div>
          <Gam3yaBadge status={g.status} />
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("gam3ya.progress", { done: completed, total: g.totalShares })}</span>
          <span className="text-muted-foreground">
            {t("gam3ya.currentCycle")}: {current?.cycle_number ?? "—"} / {g.totalShares}
          </span>
        </div>
        <Progress className="mt-3" value={(completed / g.totalShares) * 100} aria-label={t("gam3ya.progress", { done: completed, total: g.totalShares })} />
      </Card>

      <Tabs defaultValue="overview" dir={locale === "ar" ? "rtl" : "ltr"}>
        <TabsList>
          <TabsTrigger value="overview">{t("gam3ya.tabOverview")}</TabsTrigger>
          <TabsTrigger value="members">{t("gam3ya.tabMembers")}</TabsTrigger>
          {obligations.length > 0 && <TabsTrigger value="mine">{t("gam3ya.tabContributions")}</TabsTrigger>}
          {data.manage && <TabsTrigger value="manage">{t("gam3ya.tabManage")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                <Info label={t("gam3ya.contributionPerShare")}><Money value={g.contributionPerShare} /></Info>
                <Info label={t("gam3ya.totalShares")}><span className="num">{g.totalShares}</span></Info>
                <Info label={t("gam3ya.payoutPerShare")}><Money value={pot} /></Info>
                <Info label={t("gam3ya.frequency")}>{t(`frequency.${g.frequency}` as "frequency.monthly")}</Info>
                <Info label={t("gam3ya.startDate")}>{formatCivilDate(g.startDate, locale)}</Info>
                <Info label={t("gam3ya.endDate")}>{g.endDate ? formatCivilDate(g.endDate, locale) : "—"}</Info>
                {g.dueDay ? <Info label={t("gam3ya.dueDay")}>{t("gam3ya.dueDayValue", { day: g.dueDay })}</Info> : null}
                <Info label={t("gam3ya.remainingCycles")}><span className="num">{Math.max(0, g.totalShares - elapsed)}</span></Info>
                <Info label={t("gam3ya.currentRecipient")}>
                  {current ? current.holders.map((h) => (h.is_me ? t("common.you") : h.display_name)).join(" + ") : "—"}
                </Info>
                {obligations.length > 0 && (
                  <>
                    <Info label={t("gam3ya.myShares")}>
                      {[...new Map(payouts.map((p) => [p.shareNumber, p.portionBp])).entries()]
                        .map(([n, bp]) => (bp === 5000 ? `½ ${t("gam3ya.shareN", { n })}` : t("gam3ya.shareN", { n })))
                        .join("، ") || "—"}
                    </Info>
                    <Info label={t("gam3ya.myTurns")}>
                      {payouts.map((p) => formatCivilDate(p.payoutDate, locale, "short")).join("، ") || "—"}
                    </Info>
                    <Info label={t("gam3ya.nextDeadline")}>{nextObligation ? formatCivilDate(nextObligation.dueDate, locale) : "—"}</Info>
                    <Info label={t("gam3ya.remainingInstallments")}><span className="num">{remaining.count}</span></Info>
                    <Info label={t("gam3ya.remainingAmount")}><Money value={remaining.amount} /></Info>
                    <Info label={t("gam3ya.totalContribution")}><Money value={myTotalIn} /></Info>
                    <Info label={t("gam3ya.totalPayout")}><Money value={myTotalOut} /></Info>
                  </>
                )}
              </dl>
              <p className="mt-6 text-xs text-muted-foreground">{t("disclaimer.statuses")}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="size-4" /> {t("gam3ya.tabMembers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>{t("gam3ya.cycle")}</TH>
                    <TH>{t("gam3ya.recipients")}</TH>
                    <TH>{t("gam3ya.payoutDate")}</TH>
                    <TH className="text-end">{t("gam3ya.expectedAmount")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {turns.map((row) => {
                    const mine = row.holders.some((h) => h.is_me);
                    return (
                      <TR key={row.cycle_number} className={mine ? "bg-accent/40" : undefined} aria-current={row.cycle_number === current?.cycle_number ? "step" : undefined}>
                        <TD className="num font-medium">{row.cycle_number}</TD>
                        <TD>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.holders.map((h, i) => (
                              <span key={i}>
                                {h.is_me ? <strong>{t("common.you")}</strong> : h.display_name}
                                {h.portion_bp === 5000 ? <span className="text-xs text-muted-foreground"> (½)</span> : null}
                                {i < row.holders.length - 1 ? " + " : ""}
                              </span>
                            ))}
                            {mine && <Badge variant="solid">{t("gam3ya.yourTurn")}</Badge>}
                            {row.is_completed && <Badge>{t("gam3ya.completedCycle")}</Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground">{t("gam3ya.shareN", { n: row.share_number })}</span>
                        </TD>
                        <TD>{formatCivilDate(row.scheduled_date, locale)}</TD>
                        <TD className="text-end"><Money value={row.expected_amount} /></TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {obligations.length > 0 && (
          <TabsContent value="mine">
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>{t("gam3ya.tabContributions")}</CardTitle>
                <ExportButtons scope={{ kind: "member", gam3yaId: g.id }} />
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("gam3ya.cycle")}</TH>
                      <TH>{t("common.date")}</TH>
                      <TH className="text-end">{t("common.amount")}</TH>
                      <TH>{t("common.status")}</TH>
                      <TH><span className="sr-only">{t("common.actions")}</span></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {obligations.map((o) => (
                      <TR key={o.id}>
                        <TD className="num">{o.cycleNumber}</TD>
                        <TD>
                          {formatCivilDate(o.dueDate, locale)}
                          {o.recordedPaymentDate ? (
                            <div className="text-xs text-muted-foreground">{t("gam3ya.recordedOn", { date: formatCivilDate(o.recordedPaymentDate, locale) })}</div>
                          ) : null}
                        </TD>
                        <TD className="text-end"><Money value={o.amount} /></TD>
                        <TD><ContributionBadge status={contributionStatusOf(o, today)} /></TD>
                        <TD className="text-end">
                          {!readOnly && g.allowSelfReport && o.record === null ? (
                            <MemberActions kind="report" gam3yaId={g.id} targetId={o.id} />
                          ) : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {payouts.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-semibold">{t("gam3ya.myTurns")}</h3>
                    <ul className="divide-y rounded-xl border">
                      {payouts.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                          <span>
                            {t("gam3ya.cycleN", { n: p.cycleNumber })} · {formatCivilDate(p.payoutDate, locale)}
                            {p.portionBp === 5000 ? <span className="text-xs text-muted-foreground"> ({t("portion.half")})</span> : null}
                          </span>
                          <span className="flex items-center gap-2">
                            <Money value={p.amount} className="font-semibold" />
                            <PayoutBadge status={payoutStatusOf(p, today)} />
                            {!readOnly && p.record === "reported_completed" && <MemberActions kind="confirm" gam3yaId={g.id} targetId={p.id} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {data.manage && data.manageData && (
          <TabsContent value="manage">
            <ManagePanel
              gam3yaId={g.id}
              readOnly={readOnly}
              totalShares={g.totalShares}
              currentCycle={current?.cycle_number ?? 1}
              graceDays={g.graceDays}
              today={today}
              obligations={data.manageData.obligations.map((r) => ({
                id: r.id,
                cycleNumber: r.o.cycleNumber,
                dueDate: r.o.dueDate,
                amount: r.o.amount,
                record: r.o.recordStatus as "recorded_paid" | null,
                recordedPaymentDate: r.o.recordedPaymentDate,
                memberName: r.name,
                phone: r.phone,
              }))}
              payouts={data.manageData.payouts.map((p) => ({
                id: p.id,
                cycleNumber: p.cycleNumber,
                recipientShare: p.recipientShare,
                scheduledDate: p.scheduledDate,
                amount: p.expectedAmount,
                record: p.recordStatus,
                holders: turns.find((x) => x.cycle_number === p.cycleNumber)?.holders.map((h) => h.display_name) ?? [],
              }))}
              pendingRequests={data.pending.map((r) => ({ id: r.id, shareA: r.shareA, shareB: r.shareB, reason: r.reason }))}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
