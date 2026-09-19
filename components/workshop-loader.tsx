import { cn } from "@/lib/format";

export function WorkshopLoader({
  label = "Yüklənir",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "workshop-loader inline-flex items-center gap-3 text-[var(--muted)]",
        !compact && "py-8",
      )}
    >
      <span
        className={cn(
          "burnout-loader",
          compact ? "burnout-loader-compact" : "burnout-loader-large",
        )}
        aria-hidden="true"
      >
        <span className="burnout-smoke burnout-smoke-one" />
        <span className="burnout-smoke burnout-smoke-two" />
        <span className="burnout-wheel" />
      </span>
      {label ? (
        <span className={compact ? "text-sm" : "text-base"}>{label}</span>
      ) : null}
    </div>
  );
}
