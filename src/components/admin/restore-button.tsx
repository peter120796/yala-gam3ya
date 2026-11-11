"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { restoreGam3yaAction } from "@/app/actions/admin";
import { useErrorText } from "@/lib/use-error-text";

export function RestoreButton({ id }: { id: string }) {
  const t = useTranslations();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("admin.restore")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader><DialogTitle>{t("admin.restore")}</DialogTitle></DialogHeader>
          <Textarea aria-label={t("common.reason")} placeholder={t("manage.reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const res = await restoreGam3yaAction({ id, reason });
                  if (res.ok) { toast.success(t("settings.saved")); setOpen(false); } else toast.error(errorText(res));
                })
              }
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
