import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = await getTranslations("admin");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("informational")}</p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
