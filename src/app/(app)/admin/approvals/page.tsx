import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApprovalsTable } from "@/components/admin/approvals-table";
import { requireAdmin } from "@/lib/auth/session";
import { listApprovals, type ApprovalFilter } from "@/lib/admin/queries";
import { cn } from "@/lib/utils";

const FILTERS: ApprovalFilter[] = ["pending", "approved", "rejected"];

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const status = (FILTERS.includes(sp.status as ApprovalFilter) ? sp.status : "pending") as ApprovalFilter;
  const q = sp.q?.trim().slice(0, 80) || null;
  const page = Math.max(0, Number(sp.page) || 0);
  const t = await getTranslations("approvals");
  const data = await listApprovals(user.actor, status, q, page);
  const link = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { status, q, page, ...over };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && !(k === "page" && v === 0)) p.set(k, String(v));
    return `/admin/approvals?${p}`;
  };
  const pages = Math.ceil(data.total / data.pageSize);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <Link key={f} href={link({ status: f, page: 0 })} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === f ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>
              {t(f)}
            </Link>
          ))}
        </div>
        <form className="flex w-full max-w-sm gap-2" role="search">
          <input type="hidden" name="status" value={status} />
          <Input name="q" defaultValue={q ?? ""} aria-label="search" />
          <Button type="submit" variant="outline">⌕</Button>
        </form>
      </div>
      <ApprovalsTable
        key={`${status}-${q}-${page}`}
        status={status}
        q={q}
        total={data.total}
        rows={data.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      />
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 0 ? <Link className="text-primary hover:underline" href={link({ page: page - 1 })}>←</Link> : <span />}
          <span className="num text-muted-foreground">{page + 1} / {pages}</span>
          {page + 1 < pages ? <Link className="text-primary hover:underline" href={link({ page: page + 1 })}>→</Link> : <span />}
        </div>
      )}
    </div>
  );
}
