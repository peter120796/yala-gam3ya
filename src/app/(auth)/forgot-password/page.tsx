"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { requestPasswordResetAction, type FormState } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordResetAction, null);
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("forgotTitle")}</CardTitle>
        <CardDescription>{t("forgotSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <FormMessage message={state?.message ? t("linkSent") : null} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {t("sendLink")}
          </Button>
          <Link href="/login" className="text-center text-sm font-medium text-primary hover:underline">
            {t("backToSignIn")}
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
