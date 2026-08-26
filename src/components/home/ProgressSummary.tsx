import { Flame, Star, ClipboardCheck, BookOpenCheck } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import type { HomeStats } from "@/hooks/use-home-dashboard";

/** Four compact KPI cards (2x2 on mobile, single row on desktop). */
export function ProgressSummary({ stats, loading }: { stats?: HomeStats; loading?: boolean }) {
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
      <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {items.map((item) => (
          <li key={item.label} className="h-full">
            <StatCard
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              tone={item.tone}
              loading={loading}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
