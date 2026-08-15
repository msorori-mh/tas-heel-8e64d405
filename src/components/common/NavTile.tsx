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
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: string;
  className?: string;
}) {
  return (
    <Link
      // Home tiles point at static routes; params are not needed.
      to={to as never}
      className={cn(
        "flex h-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}
        aria-hidden
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
