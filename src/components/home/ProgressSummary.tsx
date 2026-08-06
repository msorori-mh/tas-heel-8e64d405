import { Flame, Star, ClipboardCheck, BookOpenCheck } from "lucide-react";
import type { HomeStats } from "@/hooks/use-home-dashboard";

/** Four compact KPI cards (2x2 on mobile, single row on desktop). */
export function ProgressSummary({
  stats,
  loading,
}: {
  stats?: HomeStats;
  loading?: boolean;
}) {
  const items = [
    {
      label: "الدروس المكتملة",
      value: stats ? `${stats.completedLessons}` : "—",
      hint: stats ? `من ${stats.totalLessons}` : "",
      icon: BookOpenCheck,
      tone: "text-primary bg-primary/10",
    },
    {
      label: "الاختبارات",
      value: stats ? `${stats.examsCompleted}` : "—",
      hint: "اختبار مكتمل",
      icon: ClipboardCheck,
      tone: "text-sky-600 bg-sky-500/10 dark:text-sky-400",
    },
    {
      label: "النقاط",
      value: stats ? `${stats.totalPoints}` : "—",
      hint: "نقطة",
      icon: Star,
      tone: "text-amber-600 bg-amber-500/10 dark:text-amber-400",
    },
    {
      label: "أيام المواظبة",
      value: stats ? `${stats.streakDays}` : "—",
      hint: "يوم متتالٍ",
      icon: Flame,
      tone: "text-orange-600 bg-orange-500/10 dark:text-orange-400",
    },
  ];

  return (
    <section aria-label="إحصائياتي">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.label}
              className="h-full rounded-2xl border border-border/60 bg-card p-4 shadow-sm lg:p-6"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}
                aria-hidden
              >
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[22px] font-black text-foreground lg:text-[28px]">
                {loading ? <span className="animate-pulse text-muted-foreground">—</span> : item.value}
              </p>
              <p className="text-sm font-medium text-foreground/80">{item.label}</p>
              {item.hint && <p className="text-sm text-muted-foreground">{item.hint}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
