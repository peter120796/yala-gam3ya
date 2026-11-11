"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { setPasswordAction, type FormState } from "@/app/actions/auth";

export default function SetPasswordPage() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(setPasswordAction, null);
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("setPasswordTitle")}</CardTitle>
        <CardDescription>{t("setPasswordSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <FormMessage error={state?.error ? t(state.error as "passwordRules") : null} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required dir="ltr" aria-describedby="pw-rules" />
            <p id="pw-rules" className="text-xs text-muted-foreground">{t("passwordRules")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required dir="ltr" />
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {t("savePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
