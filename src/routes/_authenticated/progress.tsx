import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, ClipboardList } from "lucide-react";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Progress } from "@/components/ui/progress";
import { ProgressSummary } from "@/components/home/ProgressSummary";
import { AchievementsSection } from "@/components/home/AchievementsSection";
import { useHomeDashboard } from "@/hooks/use-home-dashboard";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
});

function ProgressPage() {
  const { stats, statsLoading, badges, badgesLoading } = useHomeDashboard();
  const percent = stats?.progressPercent ?? 0;

  return (
    <div className="space-y-5" dir="rtl">
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "التقدم" }]} />

      <header>
        <h1 className="text-headline flex items-center gap-2 text-foreground">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
          تقدمي
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          نظرة شاملة على إنجازك في المنهج حتى الآن.
        </p>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">التقدم العام</span>
          <span className="font-bold text-foreground">{percent}%</span>
        </div>
        <Progress value={percent} className="h-2.5" />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {stats?.completedLessons ?? 0} درسًا مكتملًا من {stats?.totalLessons ?? 0}.
        </p>
      </section>

      <ProgressSummary stats={stats} loading={statsLoading} />

      <AchievementsSection badges={badges} loading={badgesLoading} />

      <div className="flex flex-wrap gap-2">
        <Link
          to="/exams/history"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <ClipboardList className="h-4 w-4" aria-hidden />
          سجل الاختبارات
        </Link>
        <Link
          to="/ministerial-exams/performance"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
          أدائي في الوزاري
        </Link>
      </div>
    </div>
  );
}
