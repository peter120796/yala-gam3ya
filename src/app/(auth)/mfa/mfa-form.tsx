"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage } from "@/components/form-message";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type Mode = { kind: "loading" } | { kind: "verify"; factorId: string } | { kind: "enroll"; factorId: string; qr: string; secret: string };

/** TOTP two-step verification: enroll on first use, then verify to reach aal2. */
export function MfaForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        router.replace(next);
        router.refresh();
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp.find((f) => f.status === "verified");
      if (verified) return setMode({ kind: "verify", factorId: verified.id });
      for (const f of factors?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Yala-Gam3ya ${Date.now()}` });
      if (e || !data) return setError(t("mfaInvalid"));
      setMode({ kind: "enroll", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [next, router, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind === "loading") return;
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: code.trim() });
    setPending(false);
    if (e2) return setError(t("mfaInvalid"));
    router.replace(next);
    router.refresh();
  };

  if (mode.kind === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <FormMessage error={error} />
        <Skeleton className="h-40" />
        <Skeleton className="h-11" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormMessage error={error} />
      {mode.kind === "enroll" && (
        <div className="flex flex-col items-center gap-3">
          {/* Supabase returns the QR as an SVG data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mode.qr} alt="QR" className="size-44 rounded-xl bg-white p-2" />
          <p className="text-xs text-muted-foreground">{t("mfaSecret")}</p>
          <code dir="ltr" className="break-all rounded-lg bg-muted px-3 py-2 text-xs">{mode.secret}</code>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t("mfaCode")}</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          required
          dir="ltr"
          className="text-center text-xl tracking-[0.5em]"
        />
      </div>
      <Button type="submit" size="lg" disabled={pending || code.length !== 6}>
        {t("verify")}
      </Button>
    </form>
  );
}
