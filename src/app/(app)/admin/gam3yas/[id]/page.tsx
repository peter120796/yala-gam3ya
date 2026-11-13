import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Gam3yaWizard } from "@/components/admin/gam3ya-wizard";
import { requireAdmin } from "@/lib/auth/session";
import { listAllUsersForPicker } from "@/lib/admin/queries";
import { refs } from "@/lib/data/store";
import { toDecimalString } from "@/lib/engine/money";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound();
  const user = await requireAdmin();
  const t = await getTranslations("wizard");
  const snap = await refs.gam3ya(id).get();
  if (!snap.exists) notFound();
  const g = { id, ...snap.data()! };
  if (g.status !== "draft") redirect(`/gam3yas/${id}`);
  const users = await listAllUsersForPicker(user.actor);

  const shares = Array.from({ length: g.totalShares }, (_, i) => {
    const holders = g.holdings.filter((h) => h.shareNumber === i + 1);
    return { a: holders[0]?.userId ?? "", split: holders.some((h) => h.portionBp === 5000), b: holders[1]?.userId ?? "" };
  });
  const order = g.turnOrder.length === g.totalShares ? g.turnOrder.map((s, i) => s || i + 1) : Array.from({ length: g.totalShares }, (_, i) => i + 1);
  const dedupedOrder = order.filter((v, i) => order.indexOf(v) === i);
  const fullOrder = [...dedupedOrder, ...Array.from({ length: g.totalShares }, (_, i) => i + 1).filter((n) => !dedupedOrder.includes(n))];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{t("title")} — {g.name}</h2>
      <Gam3yaWizard
        users={users}
        initial={{
          id: g.id,
          name: g.name,
          description: g.description ?? "",
          organizerId: g.organizerIds[0] ?? "",
          contribution: toDecimalString(g.contributionPerShare).replace(/\.00$/, ""),
          totalShares: g.totalShares,
          frequency: g.frequency as "monthly",
          startDate: g.startDate,
          dueDay: g.dueDay ?? 1,
          allowSelfReport: g.allowSelfReport,
          shares,
          order: fullOrder,
        }}
      />
    </div>
  );
}
