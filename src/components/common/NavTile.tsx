import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 17A — The single ACTION CARD / entry-tile pattern.
 * Replaces four near-identical hand-rolled home entry cards.
 */
export function NavTile({
  to,
  icon: Icon,
  title,
  description,
  tone = "bg-primary/10 text-primary",
  className,
  compact = false,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: string;
  className?: string;
  /** Two-per-row layout: icon on top, no chevron, tighter text. */
  compact?: boolean;
}) {
  return (
    <Link
      // Home tiles point at static routes; params are not needed.
      to={to as never}
      className={cn(
        "h-full rounded-2xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact
          ? "flex min-h-28 flex-col items-start gap-2 p-3"
          : "flex min-h-20 items-center gap-3 p-4",
        className,
      )}
    >
      <span
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[15px] font-bold text-foreground",
            compact ? "leading-snug" : "truncate",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "mt-0.5 block leading-relaxed text-muted-foreground",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {description}
        </span>
      </span>
      {compact ? null : (
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </Link>
  );
}

