import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * TAMKEEN_DESIGN_SYSTEM_V2_FOUNDATION_19C — foundation primitives.
 *
 * Presentation only: no data fetching, no routing, no side effects.
 * Every color/elevation comes from `.ds-v2` CSS variables — no hardcoded hex.
 * Not wired into the real app in 19C (foundation + showcase only).
 */

export function DsScope({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div dir="rtl" className={cn("ds-v2 min-h-dvh", className)}>
      {children}
    </div>
  );
}

export function DsCard({
  children,
  className,
  tone = "plain",
}: {
  children: ReactNode;
  className?: string;
  tone?: "plain" | "raised" | "signature";
}) {
  return (
    <section
      className={cn(
        "fm-card p-3.5",
        tone === "raised" && "ds-raised",
        tone === "signature" && "fm-grad border-transparent text-primary-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function DsSectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <h2 className="min-w-0 truncate text-[15px] font-bold text-foreground sm:text-base">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function DsButton({
  children,
  variant = "primary",
  className,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "signature";
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  const styles: Record<string, string> = {
    primary: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    quiet: "border border-border bg-card text-foreground",
    signature: "fm-grad text-primary-foreground",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "fm-press inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-pill)] px-4 py-2.5 text-[13.5px] font-bold",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DsBadge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "goal" | "success" | "secondary";
  className?: string;
}) {
  const styles: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    goal: "bg-[var(--fm-goal-soft)] text-[var(--fm-goal)]",
    success: "bg-success/12 text-success",
    secondary: "bg-secondary/12 text-secondary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--ds-radius-pill)] px-2.5 py-1 text-[11px] font-semibold",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DsProgress({
  value,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  tone?: "primary" | "goal" | "success";
  className?: string;
  label?: string;
}) {
  const fill =
    tone === "goal" ? "bg-[var(--fm-goal)]" : tone === "success" ? "bg-success" : "fm-grad";
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("fm-bar h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DsStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <DsCard className="text-center">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-[22px] font-extrabold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </DsCard>
  );
}
