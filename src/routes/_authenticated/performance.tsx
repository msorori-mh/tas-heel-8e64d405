import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATTEMPT_TYPE_LABEL,
  attemptTypeLabel,
  fetchStudentUnifiedPerformance,
  formatElapsed,
  formatPercentage,
  PerformanceUnavailableError,
  type AttemptType,
  type StudentSubjectRow,
} from "@/lib/performance/unified-performance-api";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronLeft,
  Loader2,
  NotebookPen,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "تحليل أدائي | تمكين" },
      {
        name: "description",
        content:
          "لوحة واحدة لأدائك في تمكين: متوسط الدرجات، التقدم في المنهج، أقوى وأضعف الدروس، وأنماط أخطائك.",
      },
      { property: "og:title", content: "تحليل أدائي | تمكين" },
      {
        property: "og:description",
        content: "متوسط الدرجات والتقدم ونقاط القوة والضعف في مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudentPerformancePage,
});

const ATTEMPT_TYPES: AttemptType[] = [
  "ALL",
  "ORDINARY",
  "MINISTERIAL",
  "MINISTERIAL_TRAINING",
  "MINISTERIAL_STRICT",
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  // 17A: single STAT CARD pattern shared with the home KPIs.
  return <StatCard label={label} value={value} hint={hint} />;
}

function subjectMetrics(subject: StudentSubjectRow): string {
  return [
    subject.lesson_completion_percentage == null
      ? null
      : `إتمام ${formatPercentage(subject.lesson_completion_percentage)}`,
    subject.accuracy == null ? null : `دقة ${formatPercentage(subject.accuracy)}`,
    subject.blank_rate == null ? null : `فراغ ${formatPercentage(subject.blank_rate)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PerformanceEmptyState({
  filtered,
  onShowAll,
}: {
  filtered: boolean;
  onShowAll: () => void;
}) {
  return (
    <section className="empty-state-boost overflow-hidden p-5 text-right sm:p-7" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BarChart3 className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-primary">
            {filtered ? "لا توجد محاولات بهذا النوع" : "صفحة أدائك تبدأ مع أول خطوة"}
          </p>
          <h2 className="mt-1 text-lg font-black text-foreground">
            {filtered ? "جرّب عرض كل المحاولات" : "تعلّم، اختبر نفسك، وشاهد تقدمك"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {filtered
              ? "لم نسجل محاولة ضمن هذا التصنيف بعد؛ بقية نشاطك محفوظ ولن يتأثر."
              : "بعد إكمال أول درس أو اختبار ستظهر هنا درجاتك، نقاط قوتك، وما يحتاج إلى مراجعة."}
          </p>
        </div>
      </div>

      <div className="mt-5">
        {filtered ? (
          <Button type="button" onClick={onShowAll} className="min-h-11 gap-2">
            عرض كل المحاولات
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button asChild className="min-h-11 gap-2">
            <Link to="/semesters">
              <BookOpen className="h-4 w-4" aria-hidden />
              ابدأ أول درس
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

function StudentPerformancePage() {
  const [attemptType, setAttemptType] = useState<AttemptType>("ALL");

  const query = useQuery({
    queryKey: ["student-unified-performance", attemptType],
    queryFn: () => fetchStudentUnifiedPerformance(attemptType),
    // DEFECT-16-01: an unavailable RPC must surface its Arabic message immediately
    // instead of spinning through the default retry/backoff chain (weak internet).
    retry: (count, error) => !(error instanceof PerformanceUnavailableError) && count < 1,
  });

  const data = query.data;
  const bestSubject = data?.strengths.subjects[0];
  const unavailable = query.error instanceof PerformanceUnavailableError;
  const emptyPerformance = data
    ? attemptType === "ALL"
      ? data.summary.attempts_count === 0 && data.progress.completed_lessons === 0
      : data.summary.attempts_count === 0
    : false;

  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl px-4 pb-24 pt-3">
      <header className="mb-3 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="رجوع">
          <Link to="/app">
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black leading-tight text-foreground">تحليل أدائي</h1>
          <p className="truncate text-xs text-muted-foreground">
            كل مؤشراتك في مكان واحد — مشتقة من محاولاتك الفعلية.
          </p>
        </div>
      </header>

      <div className="mb-3">
        <Select value={attemptType} onValueChange={(v) => setAttemptType(v as AttemptType)}>
          <SelectTrigger aria-label="نوع المحاولات">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATTEMPT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ATTEMPT_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="text-sm">جاري تحميل تحليل الأداء…</span>
        </div>
      ) : unavailable ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            تحليل الأداء غير متاح حالياً. حاول لاحقاً.
          </CardContent>
        </Card>
      ) : query.error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            تعذّر تحميل تحليل الأداء.
          </CardContent>
        </Card>
      ) : data && emptyPerformance ? (
        <PerformanceEmptyState
          filtered={attemptType !== "ALL"}
          onShowAll={() => setAttemptType("ALL")}
        />
      ) : data ? (
        <div className="space-y-5">
          {data.summary.graded_attempts_count > 0 ? (
            <section className="grid grid-cols-2 gap-3">
              <Stat
                label="متوسط الدرجات"
                value={formatPercentage(data.summary.avg_percentage)}
                hint={`${data.summary.graded_attempts_count} محاولة مصححة`}
              />
              <Stat label="أفضل نتيجة" value={formatPercentage(data.summary.best_percentage)} />
              <Stat label="آخر نتيجة" value={formatPercentage(data.summary.latest_percentage)} />
              <Stat
                label="التحسن"
                value={
                  data.summary.improvement_percentage_points === null
                    ? "قيد القياس"
                    : `${data.summary.improvement_percentage_points > 0 ? "+" : ""}${data.summary.improvement_percentage_points.toFixed(1)}`
                }
                hint="مقارنة آخر ٣ محاولات بما قبلها"
              />
            </section>
          ) : (
            <Card className="border-primary/15 bg-primary/5">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold text-foreground">أكملت خطوات تعلم بالفعل</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    حل اختبارًا مصححًا لتظهر مؤشرات الدرجات والتحسن.
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to="/exams">الاختبارات</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {data.summary.pending_manual_count > 0 ? (
            <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              {data.summary.pending_manual_count} محاولة بانتظار التصحيح اليدوي — غير محتسبة في
              المتوسط.
            </p>
          ) : null}

          {bestSubject ? (
            <Card className="card-edu-achievement overflow-hidden">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--fm-goal-soft)] text-[#92400E]">
                  <Trophy className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-muted-foreground">أقوى مادة لديك</p>
                  <p className="truncate text-base font-black text-foreground">
                    {bestSubject.subject_name ?? "مادتك الأقوى"}
                  </p>
                </div>
                <Badge className="shrink-0 bg-[var(--fm-goal-soft)] text-[#92400E] hover:bg-[var(--fm-goal-soft)]">
                  {bestSubject.accuracy == null
                    ? "قيد القياس"
                    : formatPercentage(bestSubject.accuracy)}
                </Badge>
              </CardContent>
            </Card>
          ) : null}

          <Card className="card-edu-progress">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">تقدمي في المنهج</CardTitle>
              <CardDescription>
                {data.progress.completed_lessons} من {data.progress.total_lessons} درساً
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={data.progress.completion_percentage ?? 0} />
              <p className="text-xs text-muted-foreground">
                {formatPercentage(data.progress.completion_percentage)}
                {data.summary.avg_elapsed_seconds == null
                  ? " — أكمل اختبارًا لقياس متوسط زمنك"
                  : ` — متوسط زمن المحاولة ${formatElapsed(data.summary.avg_elapsed_seconds)}`}
              </p>
            </CardContent>
          </Card>

          {data.assessment_breakdown.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">حسب نوع الاختبار</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.assessment_breakdown.map((row) => (
                  <div
                    key={row.attempt_type}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <span className="font-semibold">{attemptTypeLabel(row.attempt_type)}</span>
                    <span className="text-muted-foreground">
                      {row.attempts} محاولة ·{" "}
                      {row.avg_percentage == null
                        ? "بانتظار التصحيح"
                        : formatPercentage(row.avg_percentage)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {data.by_subject.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">المواد</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.by_subject.map((s) => (
                  <div key={s.subject_id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">
                        {s.subject_name ?? "مادة غير مسماة"}
                      </span>
                      <Badge variant="secondary">
                        {s.avg_percentage == null
                          ? "دون اختبار"
                          : formatPercentage(s.avg_percentage)}
                      </Badge>
                    </div>
                    {subjectMetrics(s) ? (
                      <p className="mt-1 text-xs text-muted-foreground">{subjectMetrics(s)}</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {data.strengths.lessons.length > 0 || data.weaknesses.lessons.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.strengths.lessons.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-primary" aria-hidden /> نقاط قوتي
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.strengths.lessons.map((l) => (
                      <div key={l.lesson_id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{l.lesson_title ?? "درس غير مسمى"}</span>
                        <span className="text-muted-foreground">
                          {l.accuracy == null ? "قيد القياس" : formatPercentage(l.accuracy)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
              {data.weaknesses.lessons.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingDown className="h-4 w-4 text-destructive" aria-hidden /> أحتاج
                      مراجعتها
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.weaknesses.lessons.map((l) => (
                      <div key={l.lesson_id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{l.lesson_title ?? "درس غير مسمى"}</span>
                        <span className="text-muted-foreground">
                          {l.accuracy == null ? "قيد القياس" : formatPercentage(l.accuracy)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {data.mistake_patterns.unique_mistakes > 0 ||
          data.mistake_patterns.repeated_mistakes > 0 ||
          data.mistake_patterns.blank_questions > 0 ||
          data.mistake_patterns.mastered_later > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4" aria-hidden /> أنماط أخطائي
                </CardTitle>
                <CardDescription>نفس تعريفات دفتر الأخطاء.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">أسئلة أخطأت فيها</p>
                  <p className="text-lg font-bold">{data.mistake_patterns.unique_mistakes}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">أخطاء متكررة</p>
                  <p className="text-lg font-bold">{data.mistake_patterns.repeated_mistakes}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">تركتها فارغة</p>
                  <p className="text-lg font-bold">{data.mistake_patterns.blank_questions}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">أتقنتها لاحقاً</p>
                  <p className="text-lg font-bold">{data.mistake_patterns.mastered_later}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="justify-between">
              <Link to="/my-mistakes">
                <span className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4" aria-hidden /> دفتر أخطائي
                </span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between">
              <Link to="/quick-review">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" aria-hidden /> مراجعة سريعة
                </span>
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
