"use client";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrivacy } from "@/components/providers/privacy";
import { setPrivacyModeAction } from "@/app/actions/preferences";

export function PrivacyToggle() {
  const t = useTranslations("common");
  const { hidden, setHidden } = usePrivacy();
  const label = hidden ? t("privacyOff") : t("privacyOn");
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      onClick={() => {
        setHidden(!hidden);
        void setPrivacyModeAction(!hidden);
      }}
    >
      {hidden ? <EyeOff /> : <Eye />}
    </Button>
  );
}
