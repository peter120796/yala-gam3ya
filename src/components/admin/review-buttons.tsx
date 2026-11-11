"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reviewRequestAction } from "@/app/actions/admin";
import { useErrorText } from "@/lib/use-error-text";

export function ReviewButtons({ id, gam3yaId }: { id: string; gam3yaId: string }) {
  const t = useTranslations("admin");
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const run = (approve: boolean) =>
    start(async () => {
      const res = await reviewRequestAction({ id, gam3yaId, approve, note: null });
      if (res.ok) toast.success(approve ? t("approve") : t("reject"));
      else toast.error(errorText(res));
    });
  return (
    <div className="flex gap-2">
      <Button variant="outline" disabled={pending} onClick={() => run(false)}>{t("reject")}</Button>
      <Button disabled={pending} onClick={() => run(true)}>{t("approve")}</Button>
    </div>
  );
}
