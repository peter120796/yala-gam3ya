"use client";
import { useTranslations } from "next-intl";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type Scope = { kind: "member"; gam3yaId?: string } | { kind: "organizer"; gam3yaId: string };

/** CSV comes from an authorized route; PDF uses the browser's print-to-PDF on a print view. */
export function ExportButtons({ scope }: { scope: Scope }) {
  const t = useTranslations("export");
  const qs = new URLSearchParams({ scope: scope.kind, ...(scope.gam3yaId ? { gam3ya: scope.gam3yaId } : {}) });
  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={`/api/export?${qs}`} download>
          <Download /> {t("csv")}
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`/print?${qs}`} target="_blank" rel="noopener">
          <Printer /> {t("pdf")}
        </a>
      </Button>
    </div>
  );
}
