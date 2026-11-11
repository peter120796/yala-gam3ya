"use client";
import * as React from "react";
import { Progress as P } from "radix-ui";
import { cn } from "@/lib/utils";

export function Progress({ className, value, ...props }: React.ComponentProps<typeof P.Root>) {
  return (
    <P.Root className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-muted", className)} value={value} {...props}>
      <P.Indicator
        className="h-full bg-brand transition-all rtl:origin-right"
        style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
      />
    </P.Root>
  );
}
