import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsForms } from "@/components/settings/settings-forms";
import { asUser, requireUser } from "@/lib/auth/session";
import { notificationPreferences } from "@/lib/db/schema";
import { publicEnv } from "@/lib/env";

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const [prefs] = await asUser(user, (tx) => tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId, user.userId)));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      <SettingsForms
        profile={{ displayName: user.displayName, phone: user.phone ?? "", email: user.email ?? "" }}
        theme={user.theme}
        privacyMode={user.privacyMode}
        notifications={{
          emailEnabled: prefs?.emailEnabled ?? true,
          contributionReminders: prefs?.contributionReminders ?? true,
          payoutReminders: prefs?.payoutReminders ?? true,
          gam3yaUpdates: prefs?.gam3yaUpdates ?? true,
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("security")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/set-password">{t("changePassword")}</Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("privacyRequests")}</CardTitle>
          <CardDescription>{t("privacyRequestsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href={`mailto:${publicEnv.supportEmail}?subject=Yala-Gam3ya%20privacy%20request`}>{t("contactSupport")}</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
