import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { getMyObligations, getMyPayouts } from "@/lib/data/reads";
import { monthKey, todayIn } from "@/lib/engine/dates";
import { isContributionSettled } from "@/lib/engine/status";
import { Simulator } from "@/components/gam3ya/simulator";

/** What-if: runs entirely in the browser on the user's own schedule — nothing is saved. */
export default async function SimulatorPage() {
  const user = await requireUser();
  const t = await getTranslations("simulator");
  const today = todayIn();
  const data = {
    obligations: (await getMyObligations(user.actor)).filter((o) => !isContributionSettled(o.record)),
    payouts: (await getMyPayouts(user.actor)).filter((p) => p.record !== "confirmed_completed"),
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Simulator
        today={today}
        fromMonth={monthKey(today)}
        existing={{
          obligations: data.obligations.map((o) => ({ dueDate: o.dueDate, amount: o.amount })),
          payouts: data.payouts.map((p) => ({ payoutDate: p.payoutDate, amount: p.amount })),
        }}
      />
    </div>
  );
}
