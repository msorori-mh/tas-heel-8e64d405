import { Flame, Star, ClipboardCheck, TrendingUp, Loader2 } from "lucide-react";
import type { HomeStats } from "@/hooks/use-home-dashboard";

type ProgressSummaryProps = {
  stats: HomeStats | undefined;
  loading: boolean;
};

const cards = [
  { key: "streak", icon: Flame, label: "أيام متتالية", accent: "text-orange-500 bg-orange-500/10" },
  { key: "points", icon: Star, label: "النقاط", accent: "text-primary bg-primary/10" },
  { key: "exams", icon: ClipboardCheck, label: "اختبارات مكتملة", accent: "text-blue-600 bg-blue-500/10" },
  { key: "progress", icon: TrendingUp, label: "التقدم العام", accent: "text-violet-600 bg-violet-500/10" },
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
      <h2 className="mb-3 text-sm font-bold text-foreground">ملخص التقدم</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cards.map(({ key, icon: Icon, label, accent }) => (
          <div
            key={key}
            className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
          >
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}>
              <Icon className="h-4 w-4" />
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
