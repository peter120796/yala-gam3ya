import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asUser, requireUser } from "@/lib/auth/session";
import { policyVersions } from "@/lib/db/schema";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await requireUser({ allowOnboarding: true });
  if (!user.needsOnboarding) redirect("/");
  const rows = await asUser(user, (tx) =>
    tx
      .select({ kind: policyVersions.kind, version: policyVersions.version })
      .from(policyVersions)
      .where(and(eq(policyVersions.isCurrent, true), inArray(policyVersions.kind, ["terms", "privacy"]))),
  );
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
