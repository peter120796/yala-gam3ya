import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { MarkAllRead } from "@/components/shell/mark-all-read";
import { requireUser } from "@/lib/auth/session";
import { getNotifications } from "@/lib/data/reads";
import { formatInstant } from "@/lib/format";
import { renderNotification } from "@/lib/notifications/render";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const user = await requireUser();
  const [t, locale] = [await getTranslations(), await getLocale()];
  const items = await getNotifications(user.actor, 100);
  const unread = items.some((n) => !n.readAt);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("notifications.title")}</h1>
        {unread && <MarkAllRead />}
      </div>
      {items.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">{t("notifications.empty")}</Card>
      ) : (
        <Card className="divide-y">
          {items.map((n) => {
            const text = renderNotification(n.kind, n.params, locale === "en" ? "en" : "ar").text;
            return (
              <div key={n.id} className={cn("flex flex-col gap-1 p-4", !n.readAt && "bg-accent/30")}>
                {n.gam3yaId ? <Link href={`/gam3yas/${n.gam3yaId}`} className="hover:underline">{text}</Link> : <span>{text}</span>}
                <span className="text-xs text-muted-foreground">{formatInstant(new Date(n.createdAt), locale)}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
