"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  getMultiFactorResolver,
  signInWithEmailAndPassword,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { clientAuth } from "@/lib/firebase/client";
import { authErrorKey, establishSession } from "@/lib/auth/client-session";

export function LoginForm({ next, initialError, notice }: { next?: string; initialError?: string; notice?: string }) {
  const t = useTranslations("auth");
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [code, setCode] = useState("");

  const finish = async (user: Parameters<typeof establishSession>[0]) => {
    const dest = await establishSession(user, "signin", { next });
    router.replace(dest);
    router.refresh();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(clientAuth(locale), String(form.get("email")).trim(), String(form.get("password")));
      await finish(cred.user);
    } catch (err) {
      if ((err as { code?: string }).code === "auth/multi-factor-auth-required") {
        setResolver(getMultiFactorResolver(clientAuth(locale), err as MultiFactorError));
      } else setError(authErrorKey(err));
    } finally {
      setPending(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolver) return;
    setPending(true);
    setError(null);
    try {
      const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) ?? resolver.hints[0]!;
      const cred = await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()));
      await finish(cred.user);
    } catch (err) {
      setError(authErrorKey(err) === "invalidCredentials" ? "mfaInvalid" : authErrorKey(err));
    } finally {
      setPending(false);
    }
  };

  if (resolver) {
    return (
      <form onSubmit={verify} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("mfaSubtitle")}</p>
        <FormMessage error={error ? t(error as "mfaInvalid") : null} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{t("mfaCode")}</Label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required dir="ltr" autoFocus className="text-center text-xl tracking-[0.5em]" />
        </div>
        <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{t("verify")}</Button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormMessage error={error ? t(error as "invalidCredentials") : null} message={notice ?? null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required dir="ltr" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("password")}</Label>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">{t("forgot")}</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      <Button type="submit" size="lg" disabled={pending}>{pending ? t("signingIn") : t("signIn")}</Button>
      <p className="text-center text-sm text-muted-foreground">
        {tr("signup.noAccount")} <Link href="/signup" className="font-medium text-primary hover:underline">{tr("signup.createAccount")}</Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">{t("inviteOnly")}</p>
    </form>
  );
}
