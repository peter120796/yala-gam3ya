import { cn } from "@/lib/utils";

/**
 * Yala-Gam3ya mark: a ring of shares rotating around a circle — one share is
 * highlighted (the current turn) with an arrow showing the cycle moving on.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { x: 24 + Math.cos(a) * 15, y: 24 + Math.sin(a) * 15, active: i === 0 };
  });
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <rect width="48" height="48" rx="14" className="fill-navy dark:fill-[#111a2e]" />
      <path d="M24 9a15 15 0 0 1 14.2 10.2" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M39.4 15.3l-1.1 4.3-4.2-1.3" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.active ? 4 : 2.6} fill={d.active ? "#10b981" : "#d1fae5"} opacity={d.active ? 1 : 0.85} />
      ))}
      <circle cx="24" cy="24" r="5" fill="#10b981" />
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
