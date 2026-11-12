import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { about } from "@/content/about";
import { publicEnv } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("title") };
}

/** About the app + a short profile of the developer. Public page. */
export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("appBlurb")}</p>
          <p className="text-xs text-muted-foreground">{t("version", { version: publicEnv.appVersion })}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-xl">{t("madeBy")}</CardTitle>
          <p className="text-sm font-medium">{t("role")}</p>
          <p className="text-sm text-muted-foreground">{t("company")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("bio")}</p>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("skills")}</h2>
            <ul className="flex flex-wrap gap-2">
              {about.skills.map((s) => (
                <li key={s} dir="ltr" className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  {s}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t("contact")}</h2>
            <div className="flex flex-wrap gap-2">
              <a
                href={`mailto:${about.email}`}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Mail className="size-4" />
                <span className="sr-only">{t("email")}: </span>
                <span dir="ltr">{about.email}</span>
              </a>
              <a
                href={`https://wa.me/${about.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <MessageCircle className="size-4" />
                {t("whatsapp")}
              </a>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
