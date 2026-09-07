import { Link } from "@tanstack/react-router";
import type { HomeStats } from "@/hooks/use-home-dashboard";

/**
 * 21B4F — tiny progress summary. Hidden for brand-new students (no zero grid);
 * they get one guidance line instead.
 * De-clutter pass: single-line strip (ring + inline stats + details link)
 * so the home page stays a light glance; /progress owns the full view.
 */
export function CompactProgress({ stats }: { stats?: HomeStats }) {
  if (!stats) return null;

  const hasData = stats.completedLessons > 0 || stats.examsCompleted > 0 || stats.streakDays > 0;

  if (!hasData) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-3.5 py-3 text-center text-[12px] text-muted-foreground">
        ابدأ التعلم ليظهر تقدمك هنا
      </p>
    );
  }

  const percent = Math.max(0, Math.min(100, stats.progressPercent ?? 0));
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <section
      aria-label="ملخص تقدمي"
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
    >
      {/* Mini progress ring */}
      <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * percent) / 100}
            className="stroke-primary transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-foreground">
          {percent}%
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[13px] font-black text-foreground">ملخص تقدمي</h2>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {stats.completedLessons} دروس · {stats.examsCompleted} اختبارات · {stats.streakDays} أيام
          متتالية
        </p>
      </div>

      <Link to="/progress" className="shrink-0 text-xs font-bold text-primary">
        التفاصيل
      </Link>
    </section>
  );
}
