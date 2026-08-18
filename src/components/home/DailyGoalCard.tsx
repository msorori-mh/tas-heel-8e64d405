import { Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ContinueItem } from "@/hooks/use-home-dashboard";

const DAILY_TARGET = 1;

/**
 * 21B4F — compact daily goal strip (not a dashboard). Shows today's target and
 * progress; guidance text when the student has no activity yet.
 */
export function DailyGoalCard({ items }: { items: ContinueItem[] }) {
  const today = new Date().toDateString();
  const doneToday = items.filter(
    (i) => i.completed && new Date(i.updatedAt).toDateString() === today,
  ).length;
  const pct = Math.min(100, Math.round((doneToday / DAILY_TARGET) * 100));

  return (
    <section
      aria-label="هدف اليوم"
      className="rounded-xl border border-border/60 bg-card px-3.5 py-3"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="truncate text-[13px] font-bold text-foreground">هدف اليوم: درس واحد</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-primary">
          {doneToday}/{DAILY_TARGET}
        </span>
      </div>
      <Progress value={pct} className="mt-2 h-1.5" />
      {doneToday === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          أكمل درساً واحداً اليوم لتحافظ على استمراريتك.
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-success">أحسنت — أنجزت هدف اليوم.</p>
      )}
    </section>
  );
}
