import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  fetchMinisterialSessionResult,
  formatElapsed,
  mapMinisterialError,
  modelTitle,
} from "@/lib/ministerial/ministerial-student-api";
import { AlertTriangle, BookOpen, CheckCircle2, CircleDashed, Timer, XCircle } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/ministerial-exams/sessions/$sessionId/result",
)({
  head: () => ({
    meta: [
      { title: "نتيجة النموذج الوزاري — تمكين" },
      {
        name: "description",
        content: "نتيجتك في النموذج الوزاري مع مراجعة تفصيلية لكل سؤال والحل الصحيح.",
      },
      { property: "og:title", content: "نتيجة النموذج الوزاري — تمكين" },
      { property: "og:description", content: "راجع إجاباتك وتعرّف على الحلول الصحيحة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinisterialResultPage,
});

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  correct: { label: "صحيحة", className: "text-emerald-600" },
  wrong: { label: "خاطئة", className: "text-destructive" },
  blank: { label: "بدون إجابة", className: "text-muted-foreground" },
  manual_review: { label: "قيد التصحيح اليدوي", className: "text-amber-600" },
};

function MinisterialResultPage() {
  const { sessionId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-result", sessionId],
    queryFn: () => fetchMinisterialSessionResult(sessionId),
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل النتيجة…</StateMessage>;
  if (error || !data)
    return <StateMessage variant="error">{mapMinisterialError(error)}</StateMessage>;

  const s = data.summary;
  const pct = s.percentage;
  const isAden = data.model?.track_code === "aden";

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <section className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
        <h1 className="text-lg font-bold text-foreground sm:text-xl">
          {data.model ? `${data.model.subject_name} — ${modelTitle(data.model)}` : "نتيجة النموذج"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAden
            ? "مراجعة ذاتية للإجابات النصية"
            : s.attempt_mode === "strict"
              ? "محاكاة الاختبار الحقيقي"
              : "وضع التدريب"}
        </p>

        {isAden ? (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
            اكتملت المحاولة. راجع إجابتك بجانب الإجابة النموذجية لكل سؤال؛ لا يمنح النظام درجة آلية
            للإجابة النصية.
          </div>
        ) : s.manual_review_required ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <span>
              تحتوي هذه المحاولة على أسئلة تحتاج تصحيحاً يدوياً، لذلك النتيجة غير نهائية بعد.
            </span>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-end justify-between gap-2">
              <p className="text-3xl font-extrabold text-foreground">
                {pct !== null ? `${pct}%` : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {s.score ?? 0} من {s.total_points} درجة
              </p>
            </div>
            <Progress className="mt-2 h-2" value={pct ?? 0} />
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat
            label={isAden ? "تمت الإجابة" : "صحيحة"}
            value={isAden ? s.answered : (s.correct_count ?? "—")}
          />
          <Stat
            label={isAden ? "إجمالي الأسئلة" : "خاطئة"}
            value={isAden ? (s.total_questions ?? data.questions.length) : (s.wrong_count ?? "—")}
          />
          <Stat label="بدون إجابة" value={s.blank_count} />
          <Stat
            label="الزمن"
            value={
              <span className="inline-flex items-center gap-1">
                <Timer className="h-4 w-4" aria-hidden />
                {formatElapsed(s.elapsed_seconds)}
              </span>
            }
          />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">مراجعة الأسئلة</h2>
        {data.questions.map((q) => {
          const style = isAden
            ? q.response_text?.trim()
              ? { label: "تمت المراجعة", className: "text-primary" }
              : STATUS_STYLES.blank
            : (STATUS_STYLES[q.status] ?? STATUS_STYLES.blank);
          return (
            <article
              key={q.session_question_id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">السؤال {q.question_order}</p>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${style.className}`}
                >
                  {q.status === "correct" ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : q.status === "wrong" ? (
                    <XCircle className="h-4 w-4" aria-hidden />
                  ) : (
                    <CircleDashed className="h-4 w-4" aria-hidden />
                  )}
                  {style.label}
                </span>
              </div>

              {q.stimulus_text && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                  {q.stimulus_text}
                </p>
              )}
              <h3 className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-foreground">
                {q.question_text}
              </h3>

              {isAden ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-border bg-background p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">إجابتك</p>
                    <p className="whitespace-pre-wrap text-foreground">
                      {q.response_text?.trim() || "لم تُدخل إجابة."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold text-primary">الإجابة النموذجية</p>
                    <p className="whitespace-pre-wrap text-foreground">
                      {q.model_answer?.trim() || "لا توجد إجابة نموذجية متاحة."}
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {(q.options ?? []).map((opt) => {
                    const picked = q.selected_option_code === opt.option_code;
                    const isCorrect = q.correct_option_code === opt.option_code;
                    return (
                      <li
                        key={`${q.session_question_id}-${opt.option_code}`}
                        className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                          isCorrect
                            ? "border-emerald-500 bg-emerald-500/10"
                            : picked
                              ? "border-destructive bg-destructive/10"
                              : "border-border bg-background"
                        }`}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]">
                          {opt.option_code}
                        </span>
                        <span className="whitespace-pre-wrap">{opt.body}</span>
                        {picked && (
                          <span className="mr-auto shrink-0 text-[11px] text-muted-foreground">
                            إجابتك
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {q.explanation && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {q.explanation}
                </p>
              )}

              {q.lesson_id && (
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: q.lesson_id }}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  مراجعة الدرس
                </Link>
              )}
            </article>
          );
        })}
      </section>

      <div className="flex flex-wrap gap-2">
        {data.model && (
          <Button asChild variant="outline">
            <Link to="/ministerial-exams/models/$modelId" params={{ modelId: data.model.model_id }}>
              العودة إلى النموذج
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link to="/ministerial-exams">كل النماذج الوزارية</Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}
