import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({ label, value, hint, icon, accent = false }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; accent?: boolean }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-4 sm:p-5", accent && "border-transparent bg-secondary text-secondary-foreground")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-xs font-medium sm:text-sm", accent ? "opacity-80" : "text-muted-foreground")}>{label}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg [&_svg]:size-4", accent ? "bg-white/10 text-brand" : "bg-accent text-accent-foreground")}>
          {icon}
        </span>
      </div>
      <div className="text-xl font-bold leading-tight sm:text-2xl">{value}</div>
      {hint ? <div className={cn("text-xs", accent ? "opacity-80" : "text-muted-foreground")}>{hint}</div> : null}
    </Card>
  );
}
