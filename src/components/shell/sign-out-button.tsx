"use client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, type ButtonProps } from "@/components/ui/button";
import { signOutEverywhere } from "@/lib/auth/client-session";

export function SignOutButton(props: ButtonProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  return (
    <Button
      {...props}
      onClick={async () => {
        await signOutEverywhere(locale);
        router.replace("/login");
        router.refresh();
      }}
    >
      {props.children ?? t("signOut")}
    </Button>
  );
}
