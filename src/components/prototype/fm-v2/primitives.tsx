import type { ReactNode } from "react";
import { BarChart3, BookOpen, GraduationCap, Home, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A — shared prototype primitives.
 * Presentation only; no data fetching, no routing side effects.
 */

export function Bar({
  value,
  className,
  tone = "primary",
}: {
  value: number;
  className?: string;
  tone?: "primary" | "goal" | "success";
}) {
  const fill =
    tone === "goal" ? "bg-[var(--fm-goal)]" : tone === "success" ? "bg-success" : "fm-grad";

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("fm-bar h-full rounded-full", fill)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <h2 className="min-w-0 truncate text-[15px] font-bold text-foreground sm:text-base">
        {children}
      </h2>
      {action}
    </div>
  );
}

const NAV = [
  { label: "الرئيسية", icon: Home },
  { label: "موادي", icon: BookOpen },
  { label: "الاختبارات", icon: GraduationCap },
  { label: "مستواي", icon: BarChart3 },
  { label: "حسابي", icon: User },
];

export function BottomNav({ active = 0 }: { active?: number }) {
  return (
    <nav className="sticky bottom-0 z-10 mt-6 border-t border-border bg-card/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-[560px] grid-cols-5">
        {NAV.map((item, i) => {
          const Icon = item.icon;
          const on = i === active;
          return (
            <li key={item.label}>
              <button
                type="button"
                className={cn(
                  "fm-press flex w-full flex-col items-center gap-1 py-2 text-[11px] font-semibold",
                  on ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px]", on && "text-secondary")} aria-hidden />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
