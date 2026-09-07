import { cn } from "@/lib/format";

export function WorkshopLoader({ label = "Yüklənir", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={cn("inline-flex items-center gap-3 text-[var(--muted)]", !compact && "py-8")}>
      <span className={cn("wheel-loader", compact ? "size-5" : "size-10")} aria-hidden="true" />
      <span className={cn("smoke-trail", compact ? "w-8" : "w-14")} aria-hidden="true" />
      <span className={compact ? "text-sm" : "text-base"}>{label}</span>
    </div>
  );
}

