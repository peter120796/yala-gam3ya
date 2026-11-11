"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { multiFactor, TotpMultiFactorGenerator, type TotpSecret } from "firebase/auth";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage } from "@/components/form-message";
import { clientAuth } from "@/lib/firebase/client";
import { signOutEverywhere } from "@/lib/auth/client-session";

type Mode = { kind: "loading" } | { kind: "relogin" } | { kind: "enroll"; secret: TotpSecret; qr: string };

/**
 * Admin TOTP enrollment (Firebase Identity Platform). After enrolling, the
 * admin signs in again — that sign-in carries the second factor, which the
 * server requires for every admin action.
 */
export function MfaForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const auth = clientAuth(locale);
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user || multiFactor(user).enrolledFactors.length > 0) return setMode({ kind: "relogin" });
      try {
        const session = await multiFactor(user).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        const qr = await QRCode.toDataURL(secret.generateQrCodeUrl(user.email ?? "admin", "Yala-Gam3ya"), { margin: 1, width: 240 });
        setMode({ kind: "enroll", secret, qr });
      } catch {
        setMode({ kind: "relogin" });
      }
    })();
  }, [locale]);

  const relogin = async () => {
    await signOutEverywhere(locale);
    router.replace("/login?next=/admin");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind !== "enroll") return;
    setPending(true);
    setError(null);
    try {
      const user = clientAuth(locale).currentUser!;
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(mode.secret, code.trim()), "Authenticator");
      await signOutEverywhere(locale);
      router.replace("/login?mfa=enrolled&next=/admin");
    } catch {
      setError(t("mfaInvalid"));
    } finally {
      setPending(false);
    }
  };

  if (mode.kind === "loading") return <Skeleton className="h-60" />;
  if (mode.kind === "relogin") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("mfaRelogin")}</p>
        <Button size="lg" onClick={relogin}>{t("signIn")}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormMessage error={error} />
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mode.qr} alt="QR" className="size-48 rounded-xl bg-white p-2" />
        <p className="text-xs text-muted-foreground">{t("mfaSecret")}</p>
        <code dir="ltr" className="break-all rounded-lg bg-muted px-3 py-2 text-xs">{mode.secret.secretKey}</code>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t("mfaCode")}</Label>
        <Input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required dir="ltr" className="text-center text-xl tracking-[0.5em]" />
      </div>
      <Button type="submit" size="lg" disabled={pending || code.length !== 6}>{t("verify")}</Button>
    </form>
  );
}
