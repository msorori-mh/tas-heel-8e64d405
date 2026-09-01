import { Flame, Target } from "lucide-react";
import type { ContinueItem } from "@/hooks/use-home-dashboard";

const DAILY_TARGET = 1;

/**
 * 21B4F — compact daily goal strip (not a dashboard). Shows today's target and
 * progress; guidance text when the student has no activity yet.
 */
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
  const pct = Math.min(100, Math.round((doneToday / DAILY_TARGET) * 100));

  return (
    <section
      aria-label="هدف اليوم"
      className="flex h-full flex-col justify-center rounded-2xl border border-[var(--fm-goal)]/25 bg-gradient-to-br from-[var(--fm-goal-soft)]/45 via-card to-card px-4 py-4 shadow-sm sm:px-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--fm-goal-soft)] text-[#92400E]">
            <Target className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">هدف اليوم</p>
            <p className="truncate text-xs text-muted-foreground">إكمال درس واحد</p>
          </div>
        </div>
        <span
          role="progressbar"
          aria-label="التقدم في هدف اليوم"
          aria-valuemin={0}
          aria-valuemax={DAILY_TARGET}
          aria-valuenow={Math.min(doneToday, DAILY_TARGET)}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full p-1"
          style={{
            background: `conic-gradient(var(--fm-goal, #F59E0B) ${pct * 3.6}deg, var(--muted) 0deg)`,
          }}
        >
          <span className="grid h-full w-full place-items-center rounded-full bg-card text-xs font-black text-foreground">
            {Math.min(doneToday, DAILY_TARGET)}/{DAILY_TARGET}
          </span>
        </span>
      </div>
      {doneToday === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          أكمل درساً واحداً اليوم لتحافظ على استمراريتك.
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-success">أحسنت — أنجزت هدف اليوم.</p>
      )}
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Flame className="h-3.5 w-3.5 text-[var(--fm-goal)]" aria-hidden />
        {streakDays > 0
          ? `استمرارية ${streakDays} ${streakDays === 1 ? "يوم" : "أيام"}`
          : "ابدأ استمراريتك اليوم"}
      </p>
    </section>
  );
}
