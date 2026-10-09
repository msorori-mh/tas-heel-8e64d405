import { Flame } from "lucide-react";
import type { ContinueItem } from "@/hooks/use-home-dashboard";
import { arabicCount, DAY_FORMS } from "@/lib/i18n/arabic-count";
const DAILY_TARGET = 1;
export function DailyGoalCard({
  items,
  streakDays = 0,
}: {
  items: ContinueItem[];
  streakDays?: number;
}) {
  const today = new Date().toDateString();
  const doneToday = items.filter(
    (i) => i.completed && new Date(i.updatedAt).toDateString() === today,
  ).length;
  const completed = Math.min(doneToday, DAILY_TARGET);
  return (
    <section
      aria-label="هدف اليوم"
      className="rounded-[20px] border border-border bg-card px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2 text-sm font-bold text-foreground">
        <p>هدف اليوم: درس واحد</p>
        <span>
          {completed}/{DAILY_TARGET}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="التقدم في هدف اليوم"
        aria-valuemin={0}
        aria-valuemax={DAILY_TARGET}
        aria-valuenow={completed}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-[#10A7A1]"
          style={{ width: `${completed * 100}%` }}
        />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Flame className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        {streakDays > 0
          ? `استمرارية ${arabicCount(streakDays, DAY_FORMS)}`
          : "أكمل درسك الأول لتبدأ سلسلة أيامك المتتالية"}
      </p>
      {doneToday > 0 && (
        <p className="mt-2 text-xs font-semibold text-success">أحسنت — أنجزت هدف اليوم.</p>
      )}
    </section>
  );
}
