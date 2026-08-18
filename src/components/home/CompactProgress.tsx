import { Link } from "@tanstack/react-router";
import type { HomeStats } from "@/hooks/use-home-dashboard";

/**
 * 21B4F — tiny progress summary. Hidden for brand-new students (no zero grid);
 * they get one guidance line instead.
 */
export function CompactProgress({ stats }: { stats?: HomeStats }) {
  if (!stats) return null;

  const hasData =
    stats.completedLessons > 0 || stats.examsCompleted > 0 || stats.streakDays > 0;

  if (!hasData) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-3.5 py-3 text-center text-[12px] text-muted-foreground">
        ابدأ التعلم ليظهر تقدمك هنا
      </p>
    );
  }

  const cells = [
    { label: "دروس مكتملة", value: `${stats.completedLessons}` },
    { label: "اختبارات", value: `${stats.examsCompleted}` },
    { label: "أيام متتالية", value: `${stats.streakDays}` },
  ];

  return (
    <section aria-label="ملخص تقدمي" className="rounded-xl border border-border/60 bg-card p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="truncate text-sm font-black text-foreground">ملخص تقدمي</h2>
        <Link to="/progress" className="shrink-0 text-xs font-bold text-primary">
          التفاصيل
        </Link>
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <li key={c.label} className="rounded-lg bg-muted/50 px-2 py-2 text-center">
            <p className="text-base font-black text-foreground">{c.value}</p>
            <p className="truncate text-[10px] text-muted-foreground">{c.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
