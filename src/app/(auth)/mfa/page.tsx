import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { MfaForm } from "./mfa-form";

export default async function MfaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mfa) redirect("/admin");
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("mfaEnrollTitle")}</CardTitle>
        <CardDescription>{t("mfaEnrollSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <MfaForm />
      </CardContent>
    </Card>
  );
}
