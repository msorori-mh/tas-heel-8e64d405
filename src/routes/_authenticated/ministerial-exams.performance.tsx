import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, TrendingDown, TrendingUp, Minus, ChevronLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { StateMessage } from "@/components/student/StudentNav";
import {
  AnalyticsUnavailableError,
  fetchMinisterialPerformance,
  formatElapsed,
  formatPercentage,
  type PerformanceByLesson,
} from "@/lib/ministerial/ministerial-analytics-api";

export const Route = createFileRoute("/_authenticated/ministerial-exams/performance")({
  head: () => ({
    meta: [
      { title: "أدائي في الاختبارات الوزارية — تمكين" },
      {
        name: "description",
        content: "تحليل أدائك في نماذج الاختبارات الوزارية: المتوسط، أفضل نتيجة، والدروس التي تحتاج مراجعة.",
      },
      { property: "og:title", content: "أدائي في الاختبارات الوزارية — تمكين" },
      {
        property: "og:description",
        content: "متوسط النتيجة واتجاه المستوى والأداء حسب المادة والدرس.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinisterialPerformancePage,
});

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bar({ value }: { value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
    </div>
  );
}

function LessonRow({ lesson }: { lesson: PerformanceByLesson }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/lessons/$lessonId"
          params={{ lessonId: lesson.lesson_id }}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:text-primary"
        >
          {lesson.lesson_title}
        </Link>
        <span className="shrink-0 text-xs font-bold text-foreground">
          {formatPercentage(lesson.accuracy)}
        </span>
      </div>
      <div className="mt-2">
        <Bar value={lesson.accuracy} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {lesson.asked} سؤال • صحيح {lesson.correct} • خطأ {lesson.wrong} • فراغ {lesson.blank}
        {lesson.manual_pending > 0 ? ` • بانتظار التصحيح ${lesson.manual_pending}` : ""}
      </p>
    </li>
  );
}

function MinisterialPerformancePage() {
  const [tab, setTab] = useState<"weak" | "strong">("weak");
  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-performance"],
    queryFn: fetchMinisterialPerformance,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const summary = data?.summary;
  const trend = summary?.improvement_percentage_points ?? null;
  const TrendIcon = trend === null ? Minus : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  const lessons = data?.by_lesson ?? [];
  const weak = lessons.filter((l) => l.accuracy !== null && l.accuracy < 60);
  const strong = lessons.filter((l) => l.accuracy !== null && l.accuracy >= 60);
  const shown = tab === "weak" ? weak : strong;

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "النماذج الوزارية", to: "/ministerial-exams" },
          { label: "أدائي" },
        ]}
      />

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
          أدائي في الاختبارات الوزارية
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          محسوب من محاولاتك المصحّحة نهائياً داخل مسارك الدراسي فقط.
        </p>
      </header>

      {isLoading && <StateMessage variant="loading">جارٍ حساب أدائك…</StateMessage>}
      {error instanceof AnalyticsUnavailableError && (
        <StateMessage>تحليل الأداء قيد التفعيل، وسيظهر فور اعتماد التحديث.</StateMessage>
      )}
      {error && !(error instanceof AnalyticsUnavailableError) && (
        <StateMessage variant="error">تعذّر تحميل تحليل الأداء.</StateMessage>
      )}

      {data && summary && summary.attempts_count === 0 && (
        <StateMessage>لم تُكمل أي نموذج وزاري بعد. ابدأ أول محاولة لترى تحليل أدائك.</StateMessage>
      )}

      {data && summary && summary.attempts_count > 0 && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="متوسط النتيجة" value={formatPercentage(summary.avg_percentage)} />
            <StatCard label="أفضل نتيجة" value={formatPercentage(summary.best_percentage)} />
            <StatCard
              label="عدد المحاولات"
              value={String(summary.attempts_count)}
              hint={
                summary.pending_manual_count > 0
                  ? `${summary.pending_manual_count} بانتظار التصحيح`
                  : undefined
              }
            />
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">اتجاه المستوى</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-bold text-foreground">
                <TrendIcon className="h-4 w-4 text-primary" aria-hidden />
                {trend === null
                  ? "—"
                  : `${trend > 0 ? "+" : ""}${trend} نقطة`}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                متوسط الوقت {formatElapsed(summary.avg_elapsed_seconds)}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-bold text-foreground">حسب المادة</h2>
            {data.by_subject.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد نتائج نهائية بعد.</p>
            ) : (
              <ul className="space-y-3">
                {data.by_subject.map((s) => (
                  <li key={s.subject_id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate text-foreground">{s.subject_name}</span>
                      <span className="font-bold text-foreground">
                        {formatPercentage(s.avg_percentage)}
                      </span>
                    </div>
                    <Bar value={s.avg_percentage} />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {s.attempts} محاولة • أفضل {formatPercentage(s.best_percentage)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-foreground">حسب الدرس</h2>
              <div className="flex gap-1 rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setTab("weak")}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${tab === "weak" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  يحتاج مراجعة ({weak.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("strong")}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${tab === "strong" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  قوي ({strong.length})
                </button>
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد دروس في هذه الفئة حالياً.</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((l) => (
                  <LessonRow key={l.lesson_id} lesson={l} />
                ))}
              </ul>
            )}
            {data.patterns.unlinked_questions_count > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {data.patterns.unlinked_questions_count} سؤالاً غير مرتبط بدرس محدد.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-bold text-foreground">التدريب مقابل المحاكاة</h2>
            <ul className="space-y-3">
              {(["training", "strict"] as const).map((mode) => {
                const row = data.by_mode.find((m) => m.attempt_mode === mode);
                return (
                  <li key={mode}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-foreground">
                        {mode === "training" ? "وضع التدريب" : "وضع المحاكاة"}
                      </span>
                      <span className="font-bold text-foreground">
                        {formatPercentage(row?.avg_percentage ?? null)}
                      </span>
                    </div>
                    <Bar value={row?.avg_percentage ?? null} />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {row?.attempts ?? 0} محاولة
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-bold text-foreground">أنماط الإجابة</h2>
            <p className="text-xs text-muted-foreground">
              نسبة الفراغات {formatPercentage(data.patterns.blank_rate)} • نسبة الخطأ{" "}
              {formatPercentage(data.patterns.wrong_rate)}
              {data.patterns.manual_pending_questions > 0
                ? ` • ${data.patterns.manual_pending_questions} سؤالاً بانتظار التصحيح اليدوي`
                : ""}
            </p>
          </section>

          <Link
            to="/ministerial-exams/repeated"
            className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm font-semibold text-foreground hover:border-primary/40"
          >
            الأسئلة الوزارية الأكثر تكراراً
            <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        </>
      )}
    </div>
  );
}
