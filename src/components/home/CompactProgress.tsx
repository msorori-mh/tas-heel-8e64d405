import { Link } from "@tanstack/react-router";
import type { HomeStats } from "@/hooks/use-home-dashboard";
import { arabicCount, DAY_FORMS } from "@/lib/i18n/arabic-count";
export function CompactProgress({ stats }: { stats?: HomeStats }) {
  if (!stats) return null;
  if (!(stats.completedLessons || stats.examsCompleted || stats.streakDays))
    return (
      <p className="rounded-xl border border-dashed border-border/70 px-3.5 py-3 text-center text-xs text-muted-foreground">
        ابدأ التعلم ليظهر تقدمك هنا
      </p>
    );
  const cells = [
    {
      n: stats.completedLessons,
      forms: { one: "درس مكتمل", two: "درسان مكتملان", few: "دروس مكتملة", many: "درساً مكتملاً" },
    },
    {
      n: stats.examsCompleted,
      forms: { one: "اختبار واحد", two: "اختباران", few: "اختبارات", many: "اختباراً" },
    },
    { n: stats.streakDays, forms: DAY_FORMS },
  ];
  return (
    <Link
      to="/progress"
      aria-label="ملخص تقدمي"
      className="grid min-h-20 grid-cols-3 divide-x divide-x-reverse divide-border rounded-[20px] border border-border bg-card py-3 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {cells.map((cell, index) => (
        <span key={index} aria-label={arabicCount(cell.n, cell.forms)} className="min-w-0 px-2">
          <strong className="block text-xl font-black text-foreground">{cell.n}</strong>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {arabicCount(cell.n, cell.forms).replace(/^\d+ /, "")}
            {index === 2 ? " مواظبة" : ""}
          </span>
        </span>
      ))}
    </Link>
  );
}
