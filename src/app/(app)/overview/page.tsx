import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Money } from "@/components/money";
import { CommitmentsChart } from "@/components/gam3ya/commitments-chart";
import { OverviewFilters } from "@/components/gam3ya/overview-filters";
import { requireUser } from "@/lib/auth/session";
import { getMyGam3yas, getMyObligations, getMyPayouts } from "@/lib/data/reads";
import { addMonthsToKey, daysInMonth, monthKey, todayIn, toDayNumber, compareDates } from "@/lib/engine/dates";
import { sum } from "@/lib/engine/money";
import { isContributionSettled } from "@/lib/engine/status";
import { planningNet, projection, summarizeMonth } from "@/lib/engine/summary";
import { formatMonthKey, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Money value={value} className={cn("mt-1 block text-lg font-bold", tone)} />
    </Card>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ month?: string; gam3ya?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [t, locale] = [await getTranslations(), await getLocale()];
  const today = todayIn();
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : monthKey(today);
  const filter = sp.gam3ya && /^[A-Za-z0-9_-]{1,128}$/.test(sp.gam3ya) ? sp.gam3ya : undefined;

  const data = {
    gam3yas: (await getMyGam3yas(user.actor)).filter((g) => g.isMember),
    obligations: await getMyObligations(user.actor, filter),
    payouts: await getMyPayouts(user.actor, filter),
  };

  const s = summarizeMonth(month, data.obligations, data.payouts, today);
  const remaining = sum(data.obligations.filter((o) => !isContributionSettled(o.record)).map((o) => o.amount));
  const upcomingPayouts = sum(data.payouts.filter((p) => p.record !== "confirmed_completed" && compareDates(p.payoutDate, today) >= 0).map((p) => p.amount));
  const chart = projection(month, 12, data.obligations, data.payouts);

  // Calendar grid — weeks start on Saturday (Egyptian convention).
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const lead = (firstDow + 1) % 7; // offset from Saturday
  const days = daysInMonth(y, m);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weekdayFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { weekday: "short", timeZone: "UTC" });
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(Date.UTC(2026, 0, 3 + i)))); // 2026-01-03 is a Saturday
  const dateOf = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const todayNum = toDayNumber(today);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { month, gam3ya: filter, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/overview?${p}`;
  };
  const Prev = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{t("overview.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("overview.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={qs({ month: addMonthsToKey(month, -1) })} className="inline-flex size-10 items-center justify-center rounded-xl border bg-card hover:bg-muted" aria-label={t("common.back")}>
            <Prev className="size-4" />
          </Link>
          <OverviewFilters month={month} gam3ya={filter} gam3yas={data.gam3yas.map((g) => ({ id: g.gam3ya.id, name: g.gam3ya.name }))} />
          <Link href={qs({ month: addMonthsToKey(month, 1) })} className="inline-flex size-10 items-center justify-center rounded-xl border bg-card hover:bg-muted" aria-label={t("common.next")}>
            <Next className="size-4" />
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("overview.scheduled")} value={s.scheduledContributions} />
        <Stat label={t("overview.recordedPaid")} value={s.recordedPaidContributions} tone="text-primary" />
        <Stat label={t("overview.outstanding")} value={s.outstandingContributions} tone={s.overdueContributions > 0 ? "text-destructive" : undefined} />
        <Stat label={t("overview.expectedPayouts")} value={s.expectedPayouts} />
        <Stat label={t("overview.remainingTotal")} value={remaining} />
        <Stat label={t("overview.upcomingPayoutsTotal")} value={upcomingPayouts} />
      </section>

      <Alert variant="info">
        <Info />
        <div>
          <p>{t("overview.notReceived")}</p>
          <p className="mt-1">
            {t("overview.planningNet")}: <Money value={planningNet(s)} className="font-semibold" />
          </p>
        </div>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t("overview.calendar")} — {formatMonthKey(month, locale)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground" aria-hidden>
            {weekdays.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <ol className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <li key={i} aria-hidden />;
              const date = dateOf(d);
              const dayObs = data.obligations.filter((o) => o.dueDate === date);
              const dayPays = data.payouts.filter((p) => p.payoutDate === date);
              const isToday = toDayNumber(date) === todayNum;
              return (
                <li key={i} className={cn("min-h-16 rounded-lg border p-1 text-start sm:min-h-20", isToday && "border-primary ring-1 ring-primary", (dayObs.length || dayPays.length) && "bg-muted/40")}>
                  <span className={cn("num text-xs", isToday && "font-bold text-primary")}>{formatNumber(d, locale)}</span>
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {dayObs.map((o) => (
                      <li key={o.id} className="truncate rounded bg-info-soft px-1 text-[10px] text-info" title={`${t("overview.contributionDue")} · ${o.gam3yaName}`}>
                        <span className="sr-only">{t("overview.contributionDue")}: </span>
                        <Money value={o.amount} />
                      </li>
                    ))}
                    {dayPays.map((p) => (
                      <li key={p.id} className="truncate rounded bg-accent px-1 text-[10px] text-accent-foreground" title={`${t("overview.payoutDue")} · ${p.gam3yaName}`}>
                        <span className="sr-only">{t("overview.payoutDue")}: </span>
                        <Money value={p.amount} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-info-soft ring-1 ring-info/40" /> {t("overview.contributionDue")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent ring-1 ring-primary/40" /> {t("overview.payoutDue")}</span>
          </div>
          {s.scheduledContributions === 0 && s.expectedPayouts === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">{t("overview.nothingThisMonth")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("overview.projection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitmentsChart data={chart} />
        </CardContent>
      </Card>
    </div>
  );
}
