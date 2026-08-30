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
      className="flex h-full flex-col justify-center rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm sm:px-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Target className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">هدف اليوم</p>
            <p className="truncate text-xs text-muted-foreground">إكمال درس واحد</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
          {doneToday}/{DAILY_TARGET}
        </span>
      </div>
      <Progress value={pct} className="mt-3 h-2" />
      {doneToday === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          أكمل درساً واحداً اليوم لتحافظ على استمراريتك.
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-success">أحسنت — أنجزت هدف اليوم.</p>
      )}
    </section>
  );
}
