import { Flame, Star, ClipboardCheck, TrendingUp } from "lucide-react";
import type { HomeStats } from "@/hooks/use-home-dashboard";

type ProgressSummaryProps = {
  stats: HomeStats | undefined;
  loading: boolean;
};

const cards = [
  {
    key: "streak",
    icon: Flame,
    label: "أيام متتالية",
    cardClass: "card-edu-achievement",
    iconClass: "edu-achievement",
  },
  {
    key: "points",
    icon: Star,
    label: "النقاط",
    cardClass: "card-edu-achievement",
    iconClass: "edu-achievement",
  },
  {
    key: "exams",
    icon: ClipboardCheck,
    label: "اختبارات مكتملة",
    cardClass: "card-edu-exam",
    iconClass: "edu-exam",
  },
  {
    key: "progress",
    icon: TrendingUp,
    label: "التقدم العام",
    cardClass: "card-edu-progress",
    iconClass: "edu-progress",
  },
] as const;

export function ProgressSummary({ stats, loading }: ProgressSummaryProps) {
  const values: Record<string, string> = {
    streak: stats ? `${stats.streakDays}` : "0",
    points: stats ? stats.totalPoints.toLocaleString("ar-EG") : "0",
    exams: stats ? `${stats.examsCompleted}` : "0",
    progress: stats ? `${stats.progressPercent}%` : "0%",
  };

  return (
    <section aria-label="ملخص التقدم">
      <h2 className="text-headline mb-3 text-foreground">ملخص التقدم</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cards.map(({ key, icon: Icon, label, cardClass, iconClass }) => (
          <div key={key} className={`${cardClass} p-3`}>
            <div
              className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            {loading ? (
              <span className="inline-block h-6 w-8 animate-pulse rounded bg-muted" aria-hidden />
            ) : (
              <p className="text-lg font-bold text-foreground">{values[key]}</p>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
