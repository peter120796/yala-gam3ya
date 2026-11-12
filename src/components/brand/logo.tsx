import { cn } from "@/lib/utils";
import { MARK_SHAPES } from "./mark";

/**
 * Yala-Gam3ya mark — "The Circle" (اللمّة): people around one shared pot,
 * the green one is whose turn it is. Shapes come from ./mark (static markup).
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <rect width="48" height="48" rx="12" className="fill-navy dark:fill-[#111a2e]" />
      <g dangerouslySetInnerHTML={{ __html: MARK_SHAPES }} />
    </svg>
  );
}

export function Logo({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight">{label}</span>
    </span>
  );
}
