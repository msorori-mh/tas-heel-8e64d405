import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookOpen, ClipboardList, Sparkles, Target, TrendingUp } from "lucide-react";
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
    { label: "التقدم العام", pct: stats?.progressPercent ?? 0, kind: "progress" as const },
    {
      label: "الدروس المكتملة",
      pct:
        stats && stats.totalLessons > 0
          ? Math.round((stats.completedLessons / stats.totalLessons) * 100)
          : 0,
      kind: "lesson" as const,
    },
    {
      label: "الاختبارات",
      pct: stats ? Math.min(100, stats.examsCompleted * 10) : 0,
      kind: "exam" as const,
    },
  ];

  const allZero = progressRows.every((row) => row.pct === 0);

  return (
    <section className="student-hero-boost p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-right">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent-foreground">
            <Target className="h-3.5 w-3.5" aria-hidden />
            مهمة اليوم: خطوة نحو الاختبار
          </div>
          <p className="text-xs font-semibold text-primary">مرحبًا {name}</p>
          <h1 className="text-display mt-1 text-foreground">
            اليوم خطوة،<br />
            <span className="text-primary">غداً إنجاز.</span>
          </h1>
          <p className="text-body-lg mt-2 text-muted-foreground">
            رفيقك اليومي للنجاح في الثانوية — تابع تقدمك واكمل من حيث توقفت.
          </p>
          <Button
            size="lg"
            variant="hero"
            className="mt-4 w-full gap-2 sm:w-auto"
            onClick={onStartStudy}
          >
            <BookOpen className="h-4 w-4" />
            ابدأ تحدي اليوم
          </Button>
        </div>

        <div
          className="card-edu-progress relative mx-auto w-full max-w-[220px] shrink-0 p-4 sm:max-w-[240px]"
          aria-hidden
        >
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold">تقدمك اليوم</span>
          </div>
          {allZero ? (
            <div className="mt-3 space-y-2 text-right">
              <p className="text-xs font-semibold text-foreground">ابدأ أول خطوة اليوم</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                كل درس وكل اختبار يقربك من نتيجة أفضل. اختر فصلك وافتح أول درس الآن.
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-success">
                <TrendingUp className="h-3 w-3" />
                <span>التحدي يبدأ من هنا</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {progressRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{row.label}</span>
                    <span>{row.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="progress-bar-fill" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!allZero && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span>دراسة ذكية ومستمرة</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
        <Link
          to="/exams/history"
          className="edu-exam inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-opacity hover:opacity-90"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          سجل الاختبارات
        </Link>
        <Link
          to="/settings"
          className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          الإعدادات
        </Link>
      </div>
    </section>
  );
}
