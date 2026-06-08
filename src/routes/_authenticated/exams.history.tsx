import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { ChevronLeft, History, Trophy, Target, Activity } from "lucide-react";

type ExamMode = "training" | "strict" | "ministry";
type ExamStatus = "submitted" | "expired";
type Filter = "all" | ExamMode;

type HistoryRow = {
  id: string;
  template_id: string;
  mode: ExamMode;
  status: ExamStatus | "in_progress";
  started_at: string;
  submitted_at: string | null;
  total_questions: number;
  correct_answers: number;
  score: number;
  total_points: number;
  exam_templates: { title: string | null } | null;
};

const MODE_LABEL: Record<ExamMode, string> = {
  training: "تدريب",
  strict: "اختبار محاكي",
  ministry: "وزاري",
};

const MODE_BADGE: Record<ExamMode, string> = {
  training: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  strict: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ministry: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

function percentageOf(row: Pick<HistoryRow, "score" | "total_points" | "correct_answers" | "total_questions">) {
  if (row.total_points && row.total_points > 0) {
    return (Number(row.score) / Number(row.total_points)) * 100;
  }
  if (row.total_questions && row.total_questions > 0) {
    return (row.correct_answers / row.total_questions) * 100;
  }
  return 0;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ar", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const Route = createFileRoute("/_authenticated/exams/history")({
  component: ExamHistoryPage,
});

function ExamHistoryPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const query = useQuery({
    enabled: !!user?.id,
    queryKey: ["exam-history", user?.id],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select(
          "id, template_id, mode, status, started_at, submitted_at, total_questions, correct_answers, score, total_points, exam_templates(title)",
        )
        .eq("user_id", user!.id)
        .in("status", ["submitted", "expired"])
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as HistoryRow[];
    },
  });

  const rows = query.data ?? [];

  const stats = useMemo(() => {
    if (rows.length === 0)
      return { count: 0, best: 0, last: 0, avg: 0 };
    const percentages = rows.map((r) => percentageOf(r));
    const last = percentages[0] ?? 0;
    const best = percentages.reduce((m, v) => Math.max(m, v), 0);
    const sum = percentages.reduce((a, b) => a + b, 0);
    return {
      count: rows.length,
      best,
      last,
      avg: sum / percentages.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.mode === filter);
  }, [rows, filter]);

  const Breadcrumb = (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">
        موادي
      </Link>
      <span className="mx-1">/</span>
      <span className="text-foreground">سجل الاختبارات</span>
    </nav>
  );

  if (query.isLoading)
    return <StateMessage variant="loading">جارٍ تحميل السجل…</StateMessage>;
  if (query.error)
    return <StateMessage variant="error">تعذّر تحميل السجل.</StateMessage>;

  return (
    <div className="space-y-4">
      {Breadcrumb}

      <header className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">سجل الاختبارات</h1>
          <p className="text-xs text-muted-foreground">محاولاتك المنتهية فقط</p>
        </div>
      </header>

      {/* Stats */}
      <section
        className="grid grid-cols-2 gap-3"
        aria-label="ملخص النتائج"
      >
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="عدد المحاولات"
          value={String(stats.count)}
        />
        <StatCard
          icon={<Trophy className="h-4 w-4" />}
          label="أفضل نتيجة"
          value={`${Math.round(stats.best)}%`}
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="آخر نتيجة"
          value={`${Math.round(stats.last)}%`}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="المتوسط"
          value={`${Math.round(stats.avg)}%`}
        />
      </section>

      {/* Filters */}
      <div
        role="tablist"
        aria-label="تصفية حسب النوع"
        className="flex flex-wrap gap-2"
      >
        {(["all", "training", "strict", "ministry"] as const).map((f) => {
          const active = filter === f;
          const label =
            f === "all" ? "الكل" : MODE_LABEL[f];
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={[
                "min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <StateMessage>لا توجد محاولات لعرضها.</StateMessage>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => {
            const pct = Math.round(percentageOf(row));
            const date = row.submitted_at ?? row.started_at;
            return (
              <li key={row.id}>
                <Link
                  to="/exams/history/$sessionId"
                  params={{ sessionId: row.id }}
                  className="block rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {row.exam_templates?.title ?? "اختبار"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 font-medium",
                            MODE_BADGE[row.mode],
                          ].join(" ")}
                        >
                          {MODE_LABEL[row.mode]}
                        </span>
                        {row.status === "expired" && (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                            انتهى الوقت
                          </span>
                        )}
                        <span>{formatDate(date)}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {row.correct_answers} صحيح من {row.total_questions}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xl font-bold text-foreground">
                        {pct}%
                      </span>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/app">العودة إلى موادي</Link>
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
