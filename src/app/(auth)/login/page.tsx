import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("signIn") };
}

const KNOWN_ERRORS = new Set(["linkInvalid", "accountDeactivated", "invalidCredentials"]);

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; mfa?: string }> }) {
  const { next, error, mfa } = await searchParams;
  if (await getSession()) redirect("/");
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} initialError={error && KNOWN_ERRORS.has(error) ? error : undefined} notice={mfa === "enrolled" ? t("mfaEnrolled") : undefined} />
      </CardContent>
    </Card>
  );
}
