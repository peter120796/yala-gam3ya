import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-xl border p-4 text-sm [&_svg]:size-5 [&_svg]:shrink-0", {
  variants: {
    variant: {
      info: "border-info/20 bg-info-soft text-info",
      warning: "border-warning/20 bg-warning-soft text-warning",
      danger: "border-destructive/20 bg-danger-soft text-destructive",
      success: "border-primary/20 bg-accent text-accent-foreground",
    },
  },
  defaultVariants: { variant: "info" },
});

export function Alert({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role={variant === "danger" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props} />;
}
