import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { MfaForm } from "./mfa-form";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await getSession())) redirect("/login");
  const { next: raw } = await searchParams;
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("mfaTitle")}</CardTitle>
        <CardDescription>{t("mfaEnrollSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <MfaForm next={next} />
      </CardContent>
    </Card>
  );
}
