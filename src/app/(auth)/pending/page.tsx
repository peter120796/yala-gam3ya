import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/shell/sign-out-button";

/** Waiting room for self sign-ups until an admin approves them. */
export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.approvalStatus === "approved") redirect("/");
  const t = await getTranslations("pending");
  const rejected = user.approvalStatus === "rejected";
  return (
    <Card>
      <CardHeader className="items-center pb-4 text-center">
        <span className={rejected ? "mb-2 flex size-14 items-center justify-center rounded-full bg-danger-soft text-destructive" : "mb-2 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground"}>
          {rejected ? <XCircle className="size-7" /> : <Clock className="size-7" />}
        </span>
        <CardTitle className="text-2xl">{rejected ? t("rejectedTitle") : t("title", { name: user.displayName })}</CardTitle>
        <CardDescription>{rejected ? t("rejectedBody") : t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!rejected && <p className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">{t("hint")}</p>}
        <SignOutButton variant="outline" className="w-full">{t("signOut")}</SignOutButton>
      </CardContent>
    </Card>
  );
}
