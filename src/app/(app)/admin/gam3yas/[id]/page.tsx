import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Gam3yaWizard } from "@/components/admin/gam3ya-wizard";
import { asUser, requireAdmin } from "@/lib/auth/session";
import { listAllUsersForPicker } from "@/lib/admin/queries";
import { loadDraft } from "@/lib/gam3ya/drafts";
import { gam3yaOrganizers, gam3yas } from "@/lib/db/schema";
import { toDecimalString } from "@/lib/engine/money";
import { uuidSchema } from "@/lib/validation/gam3ya";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await requireAdmin();
  const t = await getTranslations("wizard");
  const data = await asUser(user, async (tx) => {
    const [g] = await tx.select().from(gam3yas).where(eq(gam3yas.id, id));
    if (!g) return null;
    if (g.status !== "draft") return { redirect: true as const };
    const draft = await loadDraft(tx, id);
    const orgs = await tx.select({ userId: gam3yaOrganizers.userId }).from(gam3yaOrganizers).where(eq(gam3yaOrganizers.gam3yaId, id));
    return { g, draft, organizerId: orgs[0]?.userId ?? "", users: await listAllUsersForPicker(tx) };
  });
  if (!data) notFound();
  if ("redirect" in data) redirect(`/gam3yas/${id}`);
  const { g, draft } = data;

  const shares = Array.from({ length: g.totalShares }, (_, i) => {
    const holders = draft.holdings.filter((h) => h.shareNumber === i + 1);
    const userOf = (m: string) => draft.memberUserIds.get(m) ?? "";
    return { a: holders[0] ? userOf(holders[0].memberId) : "", split: holders.some((h) => h.portionBp === 5000), b: holders[1] ? userOf(holders[1].memberId) : "" };
  });
  const order = Array.from({ length: g.totalShares }, (_, i) => draft.turns.find((x) => x.cycleNumber === i + 1)?.shareNumber ?? i + 1);
  const dedupedOrder = order.filter((v, i) => order.indexOf(v) === i);
  const fullOrder = [...dedupedOrder, ...Array.from({ length: g.totalShares }, (_, i) => i + 1).filter((n) => !dedupedOrder.includes(n))];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{t("title")} — {g.name}</h2>
      <Gam3yaWizard
        users={data.users}
        initial={{
          id: g.id,
          name: g.name,
          description: g.description ?? "",
          organizerId: data.organizerId,
          contribution: toDecimalString(g.contributionPerShare).replace(/\.00$/, ""),
          totalShares: g.totalShares,
          frequency: g.frequency as "monthly",
          startDate: g.startDate,
          dueDay: g.dueDay ?? 1,
          payoutOffsetDays: g.payoutOffsetDays,
          graceDays: g.graceDays,
          allowSelfReport: g.allowSelfReport,
          shares,
          order: fullOrder,
        }}
      />
    </div>
  );
}
