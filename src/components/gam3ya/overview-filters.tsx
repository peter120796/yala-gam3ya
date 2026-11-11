"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

/** Month + Gam3ya filters in one row; state lives in the URL so views are shareable. */
export function OverviewFilters({ month, gam3ya, gam3yas }: { month: string; gam3ya?: string; gam3yas: { id: string; name: string }[] }) {
  const t = useTranslations("overview");
  const router = useRouter();
  const go = (m: string, g?: string) => {
    const p = new URLSearchParams({ month: m });
    if (g) p.set("gam3ya", g);
    router.push(`/overview?${p}`);
  };
  return (
    <>
      <Input type="month" aria-label={t("month")} value={month} onChange={(e) => e.target.value && go(e.target.value, gam3ya)} className="w-40" />
      <div className="w-44">
        <NativeSelect aria-label={t("allGam3yas")} value={gam3ya ?? ""} onChange={(e) => go(month, e.target.value || undefined)}>
          <option value="">{t("allGam3yas")}</option>
          {gam3yas.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </NativeSelect>
      </div>
    </>
  );
}
