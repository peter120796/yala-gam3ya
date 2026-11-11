"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { setApprovalAction } from "@/app/actions/admin";
import { formatInstant } from "@/lib/format";
import { useErrorText } from "@/lib/use-error-text";
import { cn } from "@/lib/utils";

type Row = { id: string; displayName: string; email: string | null; phone: string | null; createdAt: string };
type Decision = "approved" | "rejected" | "pending";

export function ApprovalsTable({ rows, total, status, q }: { rows: Row[]; total: number; status: Decision; q: string | null }) {
  const t = useTranslations("approvals");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const count = allMatching ? total : selected.size;

  const toggle = (id: string) => {
    setAllMatching(false);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected(pageAll ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };

  const apply = () =>
    start(async () => {
      if (!confirm) return;
      const res = await setApprovalAction({
        decision: confirm,
        reason: reason.trim() || null,
        ...(allMatching ? { allMatching: { status, q } } : { ids: [...selected] }),
      });
      if (!res.ok) return void toast.error(errorText(res));
      toast.success(t("done", { count: res.data.count }));
      setConfirm(null);
      setReason("");
      clear();
      router.refresh();
    });

  const actions: { d: Decision; label: string; icon: React.ReactNode; variant: "default" | "destructive" | "outline" }[] = [
    ...(status !== "approved" ? [{ d: "approved" as const, label: t("approve"), icon: <Check />, variant: "default" as const }] : []),
    ...(status !== "rejected" ? [{ d: "rejected" as const, label: t("reject"), icon: <X />, variant: "destructive" as const }] : []),
    ...(status !== "pending" ? [{ d: "pending" as const, label: t("resetPending"), icon: <RotateCcw />, variant: "outline" as const }] : []),
  ];

  if (rows.length === 0) return <Card className="p-10 text-center text-muted-foreground">{t("empty")}</Card>;

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          {/* Selection toolbar — stays above the list */}
          <div className="sticky top-16 z-10 -mx-2 flex flex-wrap items-center gap-2 rounded-xl bg-card/95 px-2 py-2 backdrop-blur">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={pageAll} onChange={togglePage} aria-label={t("selectPage")} />
              {t("selectPage")}
            </label>
            {pageAll && total > rows.length && !allMatching && (
              <Button size="sm" variant="link" onClick={() => setAllMatching(true)}>{t("selectAllMatching", { count: total })}</Button>
            )}
            {count > 0 && (
              <>
                <span className="num rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{t("selected", { count })}</span>
                <Button size="sm" variant="ghost" onClick={clear}>{t("clear")}</Button>
                <div className="ms-auto flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <Button key={a.d} size="sm" variant={a.variant} onClick={() => setConfirm(a.d)} disabled={pending}>
                      {a.icon} {a.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>

          <ul className="divide-y rounded-xl border">
            {rows.map((r) => {
              const checked = allMatching || selected.has(r.id);
              return (
                <li key={r.id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50", checked && "bg-accent/30")}>
                    <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={checked} onChange={() => toggle(r.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                        {r.email}{r.phone ? ` · ${r.phone}` : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {t("signedUp")} {formatInstant(new Date(r.createdAt), locale)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent closeLabel={tc("close")}>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}: {actions.find((a) => a.d === confirm)?.label}</DialogTitle>
            <DialogDescription>{t("confirmBody", { count })}</DialogDescription>
          </DialogHeader>
          <Textarea aria-label={tc("reason")} placeholder={`${tc("reason")} (${tc("optional")})`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>{tc("cancel")}</Button>
            <Button variant={confirm === "rejected" ? "destructive" : "default"} onClick={apply} disabled={pending}>
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
