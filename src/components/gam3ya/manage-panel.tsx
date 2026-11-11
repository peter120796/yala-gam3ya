"use client";
import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Money } from "@/components/money";
import { ContributionBadge, PayoutBadge } from "@/components/gam3ya/status-badge";
import { ExportButtons } from "@/components/gam3ya/export-buttons";
import { evaluateLifecycleAction, proposeSwapAction, recordContributionAction, recordPayoutAction } from "@/app/actions/gam3ya";
import { deriveContributionStatus, derivePayoutStatus } from "@/lib/engine/status";
import type { ContributionRecordStatus, PayoutRecordStatus } from "@/lib/engine/types";
import { sum } from "@/lib/engine/money";
import { formatCivilDate } from "@/lib/format";
import { useErrorText } from "@/lib/use-error-text";

interface Ob {
  id: string;
  cycleNumber: number;
  dueDate: string;
  amount: number;
  record: ContributionRecordStatus | null;
  recordedPaymentDate: string | null;
  memberName: string;
  phone: string | null;
}
interface Po {
  id: string;
  cycleNumber: number;
  recipientShare: number;
  scheduledDate: string;
  amount: number;
  record: PayoutRecordStatus | null;
  holders: string[];
}

type Pending =
  | { kind: "contribution"; id: string; status: ContributionRecordStatus | null; needsReason: boolean; needsDate: boolean }
  | { kind: "payout"; id: string; status: PayoutRecordStatus | null; needsReason: boolean; needsDate: boolean };

export function ManagePanel(props: {
  gam3yaId: string;
  readOnly: boolean;
  totalShares: number;
  currentCycle: number;
  graceDays: number;
  today: string;
  obligations: Ob[];
  payouts: Po[];
  pendingRequests: { id: string; shareA: number; shareB: number; reason: string }[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const errorText = useErrorText();
  const [cycle, setCycle] = useState(props.currentCycle);
  const [dialog, setDialog] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(props.today);
  const [pending, start] = useTransition();

  const rows = useMemo(() => props.obligations.filter((o) => o.cycleNumber === cycle), [props.obligations, cycle]);
  const payout = props.payouts.find((p) => p.cycleNumber === cycle);
  const outstanding = sum(rows.filter((o) => o.record !== "recorded_paid" && o.record !== "waived").map((o) => o.amount));

  const open = (p: Pending) => {
    setReason("");
    setDate(props.today);
    setDialog(p);
  };

  const submit = () => {
    if (!dialog) return;
    start(async () => {
      const common = { gam3yaId: props.gam3yaId, reason: reason || null };
      const res =
        dialog.kind === "contribution"
          ? await recordContributionAction({ ...common, obligationId: dialog.id, status: dialog.status, paymentDate: dialog.needsDate ? date : null })
          : await recordPayoutAction({ ...common, payoutId: dialog.id, status: dialog.status, completionDate: dialog.needsDate ? date : null });
      if (res.ok) {
        toast.success(t("manage.recorded"));
        setDialog(null);
      } else toast.error(errorText(res));
    });
  };

  const [swap, setSwap] = useState({ a: "1", b: "2", reason: "" });
  const proposeSwap = () =>
    start(async () => {
      const res = await proposeSwapAction({ gam3yaId: props.gam3yaId, shareA: Number(swap.a), shareB: Number(swap.b), reason: swap.reason });
      if (res.ok) {
        toast.success(t("manage.swapSubmitted"));
        setSwap({ ...swap, reason: "" });
      } else toast.error(errorText(res));
    });

  const shareOptions = Array.from({ length: props.totalShares }, (_, i) => i + 1);
  const Prev = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{t("manage.contributionsForCycle")}</CardTitle>
            <CardDescription>{t("disclaimer.statuses")}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={t("common.back")} onClick={() => setCycle((c) => Math.max(1, c - 1))} disabled={cycle <= 1}>
              <Prev />
            </Button>
            <NativeSelect aria-label={t("gam3ya.cycle")} value={cycle} onChange={(e) => setCycle(Number(e.target.value))} className="w-36">
              {shareOptions.map((n) => (
                <option key={n} value={n}>
                  {t("gam3ya.cycleN", { n })}
                </option>
              ))}
            </NativeSelect>
            <Button variant="outline" size="icon" aria-label={t("common.next")} onClick={() => setCycle((c) => Math.min(props.totalShares, c + 1))} disabled={cycle >= props.totalShares}>
              <Next />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm">
            {t("manage.outstanding")}: <Money value={outstanding} className="font-semibold" />
          </p>
          <ul className="divide-y rounded-xl border">
            {rows.map((o) => {
              const status = deriveContributionStatus(o.dueDate, o.record, props.today, props.graceDays);
              return (
                <li key={o.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{o.memberName}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatCivilDate(o.dueDate, locale)}</span>
                      {o.phone ? (
                        <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1 hover:underline" dir="ltr">
                          <Phone className="size-3" /> {o.phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Money value={o.amount} className="font-semibold" />
                    <ContributionBadge status={status} />
                    {!props.readOnly && (
                      <>
                        {o.record !== "recorded_paid" && (
                          <Button size="sm" onClick={() => open({ kind: "contribution", id: o.id, status: "recorded_paid", needsReason: false, needsDate: true })}>
                            {t("manage.recordPaid")}
                          </Button>
                        )}
                        {o.record !== "waived" && o.record !== "recorded_paid" && (
                          <Button size="sm" variant="outline" onClick={() => open({ kind: "contribution", id: o.id, status: "waived", needsReason: true, needsDate: false })}>
                            {t("manage.waive")}
                          </Button>
                        )}
                        {o.record !== null && (
                          <Button size="sm" variant="ghost" onClick={() => open({ kind: "contribution", id: o.id, status: null, needsReason: true, needsDate: false })}>
                            {t("manage.markUnpaid")}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {payout && (
        <Card>
          <CardHeader>
            <CardTitle>{t("manage.payoutTitle")} {cycle}</CardTitle>
            <CardDescription>
              {payout.holders.join(" + ")} · {t("gam3ya.shareN", { n: payout.recipientShare })} · {formatCivilDate(payout.scheduledDate, locale)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Money value={payout.amount} className="text-lg font-bold" />
            <PayoutBadge status={derivePayoutStatus(payout.scheduledDate, payout.record, props.today, props.graceDays)} />
            {!props.readOnly && (
              <div className="ms-auto flex flex-wrap gap-2">
                {payout.record !== "reported_completed" && payout.record !== "confirmed_completed" && (
                  <Button size="sm" onClick={() => open({ kind: "payout", id: payout.id, status: "reported_completed", needsReason: false, needsDate: true })}>
                    {t("manage.reportCompleted")}
                  </Button>
                )}
                {payout.record !== "confirmed_completed" && (
                  <Button size="sm" variant="soft" onClick={() => open({ kind: "payout", id: payout.id, status: "confirmed_completed", needsReason: false, needsDate: true })}>
                    {t("manage.confirmCompleted")}
                  </Button>
                )}
                {payout.record !== "delayed" && payout.record !== "confirmed_completed" && (
                  <Button size="sm" variant="outline" onClick={() => open({ kind: "payout", id: payout.id, status: "delayed", needsReason: true, needsDate: false })}>
                    {t("manage.markDelayed")}
                  </Button>
                )}
                {payout.record !== null && (
                  <Button size="sm" variant="ghost" onClick={() => open({ kind: "payout", id: payout.id, status: null, needsReason: true, needsDate: false })}>
                    {t("manage.markUnpaid")}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!props.readOnly && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("manage.proposeSwap")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="swap-a">{t("manage.shareA")}</Label>
                  <NativeSelect id="swap-a" value={swap.a} onChange={(e) => setSwap({ ...swap, a: e.target.value })}>
                    {shareOptions.map((n) => <option key={n} value={n}>{t("gam3ya.shareN", { n })}</option>)}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="swap-b">{t("manage.shareB")}</Label>
                  <NativeSelect id="swap-b" value={swap.b} onChange={(e) => setSwap({ ...swap, b: e.target.value })}>
                    {shareOptions.map((n) => <option key={n} value={n}>{t("gam3ya.shareN", { n })}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <Textarea aria-label={t("common.reason")} placeholder={t("manage.reasonPlaceholder")} value={swap.reason} onChange={(e) => setSwap({ ...swap, reason: e.target.value })} />
              <Button onClick={proposeSwap} disabled={pending || swap.a === swap.b || swap.reason.trim().length < 3}>
                {t("manage.proposeSwap")}
              </Button>
              {props.pendingRequests.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("manage.pendingRequests")}</p>
                  <ul className="mt-1 text-sm">
                    {props.pendingRequests.map((r) => (
                      <li key={r.id}>• {t("manage.swapShares", { a: r.shareA, b: r.shareB })} — {r.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("common.actions")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <ExportButtons scope={{ kind: "organizer", gam3yaId: props.gam3yaId }} />
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await evaluateLifecycleAction(props.gam3yaId);
                    if (res.ok) toast.success(t(`status.gam3ya.${res.data}` as "status.gam3ya.active"));
                    else toast.error(errorText(res));
                  })
                }
              >
                <RefreshCw /> {t("manage.evaluate")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("common.confirm")}</DialogTitle>
            <DialogDescription>{t("disclaimer.statuses")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {dialog?.needsDate && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rec-date">{dialog.kind === "payout" ? t("manage.completionDate") : t("manage.paymentDate")}</Label>
                <Input id="rec-date" type="date" value={date} max={props.today} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-reason">
                {t("common.reason")} {dialog?.needsReason ? "" : `(${t("common.optional")})`}
              </Label>
              <Textarea id="rec-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("manage.reasonPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={pending || (dialog?.needsReason === true && reason.trim().length < 3)}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
