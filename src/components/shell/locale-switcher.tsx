"use client";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLocaleAction } from "@/app/actions/preferences";

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      disabled={pending}
      lang={next}
      onClick={() =>
        start(async () => {
          await setLocaleAction(next);
          router.refresh();
        })
      }
      aria-label={next === "en" ? "Switch to English" : "التحويل للعربية"}
    >
      <Languages />
      {!compact && <span>{next === "en" ? "English" : "العربية"}</span>}
    </Button>
  );
}
