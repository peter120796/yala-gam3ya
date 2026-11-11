"use client";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { signInAction, type FormState } from "@/app/actions/auth";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, null);
  const errorKey = state?.error ?? initialError;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate={false}>
      <input type="hidden" name="next" value={next ?? "/"} />
      <FormMessage error={errorKey ? t(errorKey as "invalidCredentials") : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required dir="ltr" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("password")}</Label>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t("forgot")}
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">{t("inviteOnly")}</p>
    </form>
  );
}
