import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 17A — The single STAT CARD pattern for the whole app.
 * Compact on mobile (p-3), breathable on desktop (p-4).
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "text-primary bg-primary/10",
  loading,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-full rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:p-4",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <p className={cn("text-xl font-black leading-tight text-foreground sm:text-2xl", Icon && "mt-2")}>
        {loading ? <span className="animate-pulse text-muted-foreground">—</span> : value}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-foreground/80">{label}</p>
      {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
