"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { publishPolicyAction } from "@/app/actions/admin";
import { useErrorText } from "@/lib/use-error-text";

export function PublishPolicyForm() {
  const t = useTranslations();
  const errorText = useErrorText();
  const [form, setForm] = useState({ kind: "terms" as "terms" | "privacy" | "disclaimer" | "subscription", version: "", summary: "" });
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await publishPolicyAction({ ...form, summary: form.summary || null });
          if (res.ok) { toast.success(t("settings.saved")); setForm({ ...form, version: "", summary: "" }); } else toast.error(errorText(res));
        });
      }}
    >
      <Label htmlFor="pk">{t("admin.policyKind")}</Label>
      <NativeSelect id="pk" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "terms" })}>
        {(["terms", "privacy", "disclaimer", "subscription"] as const).map((k) => <option key={k} value={k}>{t(`legal.${k}`)}</option>)}
      </NativeSelect>
      <Label htmlFor="pv">{t("admin.policyVersion")}</Label>
      <Input id="pv" dir="ltr" required maxLength={30} value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
      <Label htmlFor="ps">{t("common.reason")}</Label>
      <Textarea id="ps" maxLength={300} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
      <Button type="submit" disabled={pending || !form.version.trim()}>{t("admin.publishPolicy")}</Button>
    </form>
  );
}
