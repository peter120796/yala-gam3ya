"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { sendPasswordResetEmail } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clientAuth } from "@/lib/firebase/client";

/** Sends a Firebase password-reset email to the signed-in user's address. */
export function ChangePasswordButton({ email }: { email: string | null }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  if (!email) return null;
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await sendPasswordResetEmail(clientAuth(locale), email, { url: `${window.location.origin}/login` }).catch(() => {});
        toast.success(t("passwordResetSent"));
        setPending(false);
      }}
    >
      {t("changePassword")}
    </Button>
  );
}
