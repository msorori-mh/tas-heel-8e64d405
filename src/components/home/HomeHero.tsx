import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { HomeStats } from "@/hooks/use-home-dashboard";

type HomeHeroProps = {
  onStartStudy: () => void;
  stats?: HomeStats;
};

export function HomeHero({ onStartStudy, stats }: HomeHeroProps) {
  const { profile } = useAuth();
  const name = profile?.full_name?.trim() || "بك";

  const progressRows = [
    { label: "التقدم العام", pct: stats?.progressPercent ?? 0 },
    {
      label: "الدروس المكتملة",
      pct:
        stats && stats.totalLessons > 0
          ? Math.round((stats.completedLessons / stats.totalLessons) * 100)
          : 0,
    },
    {
      label: "الاختبارات",
      pct: stats ? Math.min(100, stats.examsCompleted * 10) : 0,
    },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-right">
          <p className="text-xs font-medium text-primary">مرحبًا {name}</p>
          <h1 className="mt-1 text-2xl font-bold leading-snug text-foreground sm:text-3xl">
            اليوم خطوة،<br />
            <span className="text-primary">غداً إنجاز.</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            رفيقك اليومي للنجاح في الثانوية — تابع تقدمك واكمل من حيث توقفت.
          </p>
          <Button
            size="lg"
            className="mt-4 w-full gap-2 bg-primary text-primary-foreground shadow-sm sm:w-auto"
            onClick={onStartStudy}
          >
            <BookOpen className="h-4 w-4" />
            ابدأ الدراسة الآن
          </Button>
        </div>

        <div
          className="relative mx-auto w-full max-w-[220px] shrink-0 rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-background to-blue-500/5 p-4 sm:max-w-[240px]"
          aria-hidden
        >
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold">تقدمك اليوم</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {progressRows.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{row.label}</span>
                  <span>{row.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span>دراسة ذكية ومستمرة</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
        <Link
          to="/exams/history"
          className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          سجل الاختبارات
        </Link>
        <Link
          to="/settings"
          className="rounded-full border border-border bg-background px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          الإعدادات
        </Link>
      </div>
    </section>
  );
}
