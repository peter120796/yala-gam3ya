"use client";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePrivacy } from "@/components/providers/privacy";
import {
  setLocaleAction,
  setPrivacyModeAction,
  setThemeAction,
  updateNotificationPrefsAction,
  updateProfileAction,
} from "@/app/actions/preferences";
import { useErrorText } from "@/lib/use-error-text";

function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

type Notif = { emailEnabled: boolean; contributionReminders: boolean; payoutReminders: boolean; gam3yaUpdates: boolean };

export function SettingsForms(props: {
  profile: { displayName: string; phone: string; email: string };
  theme: "light" | "dark" | "system";
  privacyMode: boolean;
  notifications: Notif;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const { setTheme } = useTheme();
  const { hidden, setHidden } = usePrivacy();
  const [profile, setProfile] = useState(props.profile);
  const [themeValue, setThemeValue] = useState(props.theme);
  const [notif, setNotif] = useState(props.notifications);
  const [pending, start] = useTransition();

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateProfileAction({ displayName: profile.displayName, phone: profile.phone });
      if (res.ok) {
        toast.success(t("settings.saved"));
        router.refresh();
      } else toast.error(errorText(res));
    });
  };

  const toggleNotif = (k: keyof Notif) => (v: boolean) => {
    const next = { ...notif, [k]: v };
    setNotif(next);
    start(async () => {
      const res = await updateNotificationPrefsAction(next);
      if (!res.ok) toast.error(errorText(res));
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">{t("settings.displayName")}</Label>
              <Input id="displayName" value={profile.displayName} maxLength={80} required onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} aria-describedby="dn-hint" />
              <p id="dn-hint" className="text-xs text-muted-foreground">{t("settings.displayNameHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">{t("settings.phone")}</Label>
              <Input id="phone" type="tel" inputMode="tel" dir="ltr" value={profile.phone} placeholder="01xxxxxxxxx" onChange={(e) => setProfile({ ...profile, phone: e.target.value })} aria-describedby="ph-hint" />
              <p id="ph-hint" className="text-xs text-muted-foreground">{t("settings.phoneHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" value={profile.email} disabled dir="ltr" />
            </div>
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.preferences")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row id="lang" label={t("common.language")}>
            <div className="w-36">
              <NativeSelect id="lang" value={locale} onChange={(e) => start(async () => { await setLocaleAction(e.target.value); router.refresh(); })}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </NativeSelect>
            </div>
          </Row>
          <Row id="theme" label={t("common.theme")}>
            <div className="w-36">
              <NativeSelect
                id="theme"
                value={themeValue}
                onChange={(e) => {
                  const v = e.target.value as "light" | "dark" | "system";
                  setThemeValue(v);
                  setTheme(v);
                  void setThemeAction(v);
                }}
              >
                <option value="light">{t("common.light")}</option>
                <option value="dark">{t("common.dark")}</option>
                <option value="system">{t("common.system")}</option>
              </NativeSelect>
            </div>
          </Row>
          <Row id="privacy" label={t("settings.privacyMode")} hint={t("settings.privacyModeHint")}>
            <Switch id="privacy" checked={hidden} onCheckedChange={(v) => { setHidden(v); void setPrivacyModeAction(v); }} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row id="n-email" label={t("settings.emailEnabled")}>
            <Switch id="n-email" checked={notif.emailEnabled} onCheckedChange={toggleNotif("emailEnabled")} />
          </Row>
          <Row id="n-contrib" label={t("settings.contributionReminders")}>
            <Switch id="n-contrib" checked={notif.contributionReminders} onCheckedChange={toggleNotif("contributionReminders")} />
          </Row>
          <Row id="n-payout" label={t("settings.payoutReminders")}>
            <Switch id="n-payout" checked={notif.payoutReminders} onCheckedChange={toggleNotif("payoutReminders")} />
          </Row>
          <Row id="n-updates" label={t("settings.gam3yaUpdates")}>
            <Switch id="n-updates" checked={notif.gam3yaUpdates} onCheckedChange={toggleNotif("gam3yaUpdates")} />
          </Row>
        </CardContent>
      </Card>
    </>
  );
}
