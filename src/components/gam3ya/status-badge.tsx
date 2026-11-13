import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleDot, Clock, MinusCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ContributionStatus, Gam3yaLifecycle, PayoutStatus } from "@/lib/engine/types";

const C: Record<ContributionStatus, { v: "neutral" | "info" | "danger" | "warning" | "default"; Icon: typeof Clock }> = {
  upcoming: { v: "neutral", Icon: Clock },
  due: { v: "info", Icon: CircleDot },
  reported_paid: { v: "warning", Icon: Send },
  recorded_paid: { v: "default", Icon: CheckCircle2 },
  waived: { v: "neutral", Icon: MinusCircle },
};
const P: Record<PayoutStatus, { v: "neutral" | "info" | "danger" | "warning" | "default"; Icon: typeof Clock }> = {
  scheduled: { v: "neutral", Icon: Clock },
  due: { v: "info", Icon: CircleDot },
  delayed: { v: "danger", Icon: AlertTriangle },
  reported_completed: { v: "warning", Icon: Send },
  confirmed_completed: { v: "default", Icon: CheckCircle2 },
};
const G: Record<Gam3yaLifecycle, "neutral" | "default" | "warning" | "info" | "danger"> = {
  draft: "neutral",
  active: "default",
  needs_closure: "warning",
  completed: "info",
  cancelled: "danger",
};

/** Status is always icon + text, never color alone. */
export function ContributionBadge({ status }: { status: ContributionStatus }) {
  const t = useTranslations("status.contribution");
  const { v, Icon } = C[status];
  return (
    <Badge variant={v}>
      <Icon className="size-3.5" aria-hidden /> {t(status)}
    </Badge>
  );
}

export function PayoutBadge({ status }: { status: PayoutStatus }) {
  const t = useTranslations("status.payout");
  const { v, Icon } = P[status];
  return (
    <Badge variant={v}>
      <Icon className="size-3.5" aria-hidden /> {t(status)}
    </Badge>
  );
}

export function Gam3yaBadge({ status }: { status: string }) {
  const t = useTranslations("status.gam3ya");
  const s = (status in G ? status : "active") as Gam3yaLifecycle;
  return <Badge variant={G[s]}>{t(s)}</Badge>;
}
