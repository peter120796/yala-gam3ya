"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPaymentMethodAction } from "@/app/actions/gam3ya";
import { useErrorText } from "@/lib/use-error-text";

/** "How I'll pay" (طريقة الدفع) — the member's own note; only the admin and the organizer read it. */
export function PaymentMethodCard({ gam3yaId, initial, readOnly }: { gam3yaId: string; initial: string | null; readOnly: boolean }) {
  const t = useTranslations("payMethod");
  const errorText = useErrorText();
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial ?? "");
  const [editing, setEditing] = useState(!initial && !readOnly);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await setPaymentMethodAction({ gam3yaId, text });
      if (!res.ok) return void toast.error(errorText(res));
      setSaved(res.data.text);
      setText(res.data.text ?? "");
      setEditing(!res.data.text);
      toast.success(t("saved"));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="size-4" /> {t("title")}</CardTitle>
        <CardDescription>{t("who")}</CardDescription>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-2">
            <Label htmlFor={`pm-${gam3yaId}`} className="sr-only">{t("title")}</Label>
            <Textarea
              id={`pm-${gam3yaId}`}
              value={text}
              maxLength={200}
              rows={2}
              placeholder={t("placeholder")}
              aria-describedby={`pm-hint-${gam3yaId}`}
              onChange={(e) => setText(e.target.value)}
            />
            <p id={`pm-hint-${gam3yaId}`} className="text-xs text-muted-foreground">{t("hint")}</p>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || text.trim().length < 2}>{t("save")}</Button>
              {saved ? (
                <Button type="button" variant="outline" onClick={() => { setText(saved); setEditing(false); }}>{t("cancel")}</Button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{saved ?? <span className="text-muted-foreground">{t("none")}</span>}</p>
            {!readOnly && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{t("edit")}</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
