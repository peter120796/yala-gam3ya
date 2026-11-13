"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/** Password field with a show/hide button so people can check what they typed. */
export function PasswordInput({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useTranslations("auth");
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative" dir={props.dir}>
      <Input {...props} type={visible ? "text" : "password"} className={cn("pe-12", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
