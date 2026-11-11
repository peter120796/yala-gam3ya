import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentPolicies, requireUser } from "@/lib/auth/session";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await requireUser({ allowOnboarding: true });
  if (!user.needsOnboarding) redirect("/");
  const rows = (await currentPolicies()).filter((p) => p.doc.requiresAcceptance).map((p) => ({ kind: p.doc.kind, version: p.doc.version }));
  const t = await getTranslations("onboarding");
  const versions = Object.fromEntries(rows.map((r) => [r.kind, r.version]));
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length < 2 ? <p className="text-sm">{t("noPolicies")}</p> : <OnboardingForm versions={versions} />}
      </CardContent>
    </Card>
  );
}
