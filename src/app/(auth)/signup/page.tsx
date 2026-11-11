"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { clientAuth } from "@/lib/firebase/client";
import { establishSession } from "@/lib/auth/client-session";

const PHONE = /^(\+?20|0)?1[0125]\d{8}$/;
const PASSWORD_OK = (p: string) => p.length >= 10 && /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p);

/** Self sign-up → account is PENDING until an admin approves it. */
export default function SignUpPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const displayName = String(f.get("displayName")).trim();
    const email = String(f.get("email")).trim().toLowerCase();
    const phone = String(f.get("phone") ?? "").replace(/[\s-]/g, "");
    const password = String(f.get("password"));
    if (password !== f.get("confirm")) return setError("passwordsMismatch");
    if (!PASSWORD_OK(password)) return setError("passwordRules");
    if (phone && !PHONE.test(phone)) return setError("invalidPhone");
    if (displayName.length < 2) return setError("signupInvalid");
    if (!f.get("terms")) return setError("termsRequired");
    setPending(true);
    setError(null);
    try {
      const auth = clientAuth(locale);
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user, { url: `${window.location.origin}/pending` }).catch(() => {});
      router.replace(await establishSession(cred.user, "signup", { displayName, phone }));
      router.refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Same message for "email already in use" — no account enumeration.
      setError(code === "auth/too-many-requests" ? "rateLimited" : code === "auth/weak-password" ? "passwordRules" : code === "auth/email-already-in-use" ? "emailUnavailable" : "signupInvalid");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("signup.title")}</CardTitle>
        <CardDescription>{t("signup.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormMessage error={error ? t(`signup.errors.${error}` as "signup.errors.signupInvalid") : null} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">{t("settings.displayName")}</Label>
            <Input id="displayName" name="displayName" autoComplete="name" required minLength={2} maxLength={80} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">{t("settings.phone")} ({t("common.optional")})</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01xxxxxxxxx" dir="ltr" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required dir="ltr" aria-describedby="pw-rules" />
            <p id="pw-rules" className="text-xs text-muted-foreground">{t("auth.passwordRules")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required dir="ltr" />
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="terms" required className="mt-0.5 size-5 accent-[var(--primary)]" />
            <span>
              {t.rich("signup.terms", {
                terms: (c) => <Link href="/legal/terms" target="_blank" className="text-primary underline">{c}</Link>,
                privacy: (c) => <Link href="/legal/privacy" target="_blank" className="text-primary underline">{c}</Link>,
              })}
            </span>
          </label>
          <Button type="submit" size="lg" disabled={pending}>{t("signup.submit")}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("signup.haveAccount")} <Link href="/login" className="font-medium text-primary hover:underline">{t("auth.signIn")}</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
