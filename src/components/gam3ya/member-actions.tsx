"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordContributionAction, recordPayoutAction } from "@/app/actions/gam3ya";
import { useErrorText } from "@/lib/use-error-text";

/** Member self-service: report a contribution as paid, or confirm a payout was received. */
export function MemberActions({ kind, gam3yaId, targetId }: { kind: "report" | "confirm"; gam3yaId: string; targetId: string }) {
  const t = useTranslations();
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res =
        kind === "report"
          ? await recordContributionAction({ gam3yaId, obligationId: targetId, status: "reported_paid" })
          : await recordPayoutAction({ gam3yaId, payoutId: targetId, status: "confirmed_completed" });
      if (res.ok) toast.success(t("manage.recorded"));
      else toast.error(errorText(res));
    });
  return (
    <Button size="sm" variant="soft" onClick={run} disabled={pending}>
      {kind === "report" ? t("gam3ya.reportPaid") : t("gam3ya.confirmReceipt")}
    </Button>
  );
}
