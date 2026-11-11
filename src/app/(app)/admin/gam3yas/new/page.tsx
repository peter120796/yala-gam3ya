import { getTranslations } from "next-intl/server";
import { Gam3yaWizard } from "@/components/admin/gam3ya-wizard";
import { asUser, requireAdmin } from "@/lib/auth/session";
import { listAllUsersForPicker } from "@/lib/admin/queries";
import { todayIn } from "@/lib/engine/dates";

export default async function NewGam3yaPage() {
  const user = await requireAdmin();
  const t = await getTranslations("wizard");
  const users = await asUser(user, (tx) => listAllUsersForPicker(tx));
  const shares = 10;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{t("title")}</h2>
      <Gam3yaWizard
        users={users}
        initial={{
          id: null,
          name: "",
          description: "",
          organizerId: "",
          contribution: "1000",
          totalShares: shares,
          frequency: "monthly",
          startDate: todayIn(),
          dueDay: 1,
          payoutOffsetDays: 0,
          graceDays: 3,
          allowSelfReport: false,
          shares: Array.from({ length: shares }, () => ({ a: "", split: false, b: "" })),
          order: Array.from({ length: shares }, (_, i) => i + 1),
        }}
      />
    </div>
  );
}
