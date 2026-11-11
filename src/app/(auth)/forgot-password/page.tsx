"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { clientAuth } from "@/lib/firebase/client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setPending(true);
    // Firebase sends the email (in the selected language). Same answer either way — no enumeration.
    await sendPasswordResetEmail(clientAuth(locale), email, { url: `${window.location.origin}/login` }).catch(() => {});
    setSent(true);
    setPending(false);
  };
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("forgotTitle")}</CardTitle>
        <CardDescription>{t("forgotSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormMessage message={sent ? t("linkSent") : null} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
          </div>
          <Button type="submit" size="lg" disabled={pending}>{t("sendLink")}</Button>
          <Link href="/login" className="text-center text-sm font-medium text-primary hover:underline">{t("backToSignIn")}</Link>
        </form>
      </CardContent>
    </Card>
  );
}
