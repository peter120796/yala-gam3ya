"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/form-message";
import { acceptPoliciesAction } from "@/app/actions/preferences";

function Row({ checked, onChange, href, label, linkText, versionText }: { checked: boolean; onChange: (v: boolean) => void; href: string; label: string; linkText: string; versionText?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
      <span className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          <Link href={href} target="_blank" className="text-primary underline">{linkText}</Link>
          {versionText ? ` · ${versionText}` : null}
        </span>
      </span>
    </label>
  );
}

export function OnboardingForm({ versions }: { versions: { terms?: string; privacy?: string } }) {
  const t = useTranslations();
  const router = useRouter();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!terms || !privacy) return setError(t("onboarding.required"));
    start(async () => {
      const res = await acceptPoliciesAction({ terms: true, privacy: true });
      if (!res.ok) return setError(t(`errors.${res.error}` as "errors.unexpected_error"));
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <FormMessage error={error} />
      <Row checked={terms} onChange={setTerms} href="/legal/terms" label={t("onboarding.acceptTerms")} linkText={t("legal.terms")} versionText={versions.terms ? t("onboarding.version", { version: versions.terms }) : undefined} />
      <Row checked={privacy} onChange={setPrivacy} href="/legal/privacy" label={t("onboarding.acceptPrivacy")} linkText={t("legal.privacy")} versionText={versions.privacy ? t("onboarding.version", { version: versions.privacy }) : undefined} />
      <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{t("disclaimer.short")}</p>
      <Button size="lg" onClick={submit} disabled={pending}>
        {t("onboarding.submit")}
      </Button>
    </div>
  );
}
