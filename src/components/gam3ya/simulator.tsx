"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Money } from "@/components/money";
import { CommitmentsChart } from "@/components/gam3ya/commitments-chart";
import { parseMoneyInput, normalizeDigits } from "@/lib/engine/money";
import { simulateJoin, type SimulationResult } from "@/lib/engine/simulator";
import { formatMonthKey } from "@/lib/format";

export function Simulator({
  today,
  fromMonth,
  existing,
}: {
  today: string;
  fromMonth: string;
  existing: { obligations: { dueDate: string; amount: number }[]; payouts: { payoutDate: string; amount: number }[] };
}) {
  const t = useTranslations("simulator");
  const locale = useLocale();
  const [form, setForm] = useState({ contribution: "1000", holding: "10000", duration: "10", start: today, dueDay: "1", turns: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const result = useMemo((): SimulationResult | null => {
    const contribution = parseMoneyInput(form.contribution);
    const turns = normalizeDigits(form.turns.replace(/[،,]/g, " ").replace(/\s+/g, " "))
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    try {
      return simulateJoin(
        existing,
        {
          contributionPerShare: contribution ?? 0,
          holdingBp: Number(form.holding),
          durationCycles: Number(normalizeDigits(form.duration)),
          startDate: form.start,
          dueDay: Number(normalizeDigits(form.dueDay)),
          turnCycles: form.turns.trim() ? turns : [],
        },
        fromMonth,
        12,
      );
    } catch {
      return null;
    }
  }, [form, existing, fromMonth]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="size-4" /> {t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-c">{t("contribution")}</Label>
            <Input id="s-c" inputMode="decimal" value={form.contribution} onChange={set("contribution")} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-h">{t("shares")}</Label>
            <NativeSelect id="s-h" value={form.holding} onChange={set("holding")}>
              <option value="5000">{t("halfShare")}</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n * 10000}>{n}</option>)}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-d">{t("duration")}</Label>
              <Input id="s-d" inputMode="numeric" value={form.duration} onChange={set("duration")} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-dd">{t("dueDay")}</Label>
              <Input id="s-dd" inputMode="numeric" value={form.dueDay} onChange={set("dueDay")} dir="ltr" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-s">{t("startDate")}</Label>
            <Input id="s-s" type="date" value={form.start} onChange={set("start")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-t">{t("turns")}</Label>
            <Input id="s-t" value={form.turns} onChange={set("turns")} dir="ltr" aria-describedby="s-t-hint" />
            <p id="s-t-hint" className="text-xs text-muted-foreground">{t("turnsHint")}</p>
          </div>
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{t("notSaved")}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        {!result ? (
          <Alert variant="warning">{t("invalid")}</Alert>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("newCommitment")}</p>
                <Money value={result.newMonthlyCommitment} className="mt-1 block text-xl font-bold" />
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("highestMonth")}</p>
                {result.highestCommitment ? (
                  <>
                    <Money value={result.highestCommitment.amount} className="mt-1 block text-xl font-bold" />
                    <p className="text-xs text-muted-foreground">{formatMonthKey(result.highestCommitment.month, locale)}</p>
                  </>
                ) : <p className="mt-1">—</p>}
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">{t("payoutMonths")}</p>
                {result.payoutMonths.length ? (
                  <ul className="mt-1 text-sm">
                    {result.payoutMonths.map((p) => (
                      <li key={p.month}>{formatMonthKey(p.month, locale)} · <Money value={p.amount} className="font-semibold" /></li>
                    ))}
                  </ul>
                ) : <p className="mt-1">—</p>}
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>{t("after")}</CardTitle></CardHeader>
              <CardContent><CommitmentsChart data={result.after} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("before")}</CardTitle></CardHeader>
              <CardContent><CommitmentsChart data={result.before} height={200} /></CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
