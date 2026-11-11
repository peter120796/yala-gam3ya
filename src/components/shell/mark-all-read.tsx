"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/app/actions/preferences";

export function MarkAllRead() {
  const t = useTranslations("notifications");
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => void (await markNotificationsReadAction(undefined)))}>
      <CheckCheck /> {t("markAllRead")}
    </Button>
  );
}
