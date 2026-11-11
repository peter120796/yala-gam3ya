import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { legalDocs, legalSlugs, type LegalSlug } from "@/content/legal";
import { publicEnv } from "@/lib/env";
import { formatCivilDate } from "@/lib/format";


export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!legalSlugs.includes(slug as LegalSlug)) notFound();
  const locale = (await getLocale()) === "en" ? "en" : "ar";
  const t = await getTranslations("legal");
  const doc = legalDocs[locale][slug as LegalSlug];
  return (
    <Card className="max-w-none">
      <CardHeader>
        <CardTitle className="text-2xl">{doc.title}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("lastUpdated", { date: formatCivilDate(doc.updated, locale) })}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert variant="warning">
          <AlertTriangle />
          <span>{t("draftNotice")}</span>
        </Alert>
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-semibold">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">{p}</p>
            ))}
          </section>
        ))}
        {slug === "contact" && (
          <a href={`mailto:${publicEnv.supportEmail}`} className="font-medium text-primary underline" dir="ltr">
            {publicEnv.supportEmail}
          </a>
        )}
        <nav className="flex flex-wrap gap-3 border-t pt-4 text-sm">
          {legalSlugs.filter((s) => s !== slug).map((s) => (
            <Link key={s} href={`/legal/${s}`} className="text-primary hover:underline">{t(s)}</Link>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}
