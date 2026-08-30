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
        "flex min-h-20 h-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        <span className="block truncate text-[15px] font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
