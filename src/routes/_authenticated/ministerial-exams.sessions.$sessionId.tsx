import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  answerMinisterialQuestion,
  fetchMinisterialSessionState,
  mapMinisterialError,
  modelTitle,
  type MinisterialSessionQuestion,
} from "@/lib/ministerial/ministerial-student-api";
import { safeExamMutationMessage } from "@/lib/exam-client-safety";
import { AlertTriangle, ChevronLeft, ChevronRight, Send, Timer } from "lucide-react";

const searchSchema = z.object({
  mode: fallback(z.union([z.literal("training"), z.literal("strict")]), "training").default(
    "training",
  ),
});

export const Route = createFileRoute("/_authenticated/ministerial-exams/sessions/$sessionId")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "جلسة نموذج وزاري — تمكين" },
      { name: "description", content: "حل أسئلة النموذج الوزاري في وضع التدريب أو المحاكاة." },
      { property: "og:title", content: "جلسة نموذج وزاري — تمكين" },
      { property: "og:description", content: "تدرّب على النماذج الوزارية السابقة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinisterialSessionPage,
});

type Option = { option_code: string; body: string };

function optionsOf(q: MinisterialSessionQuestion): Option[] {
  return Array.isArray(q.options) ? (q.options as Option[]) : [];
}

function MinisterialSessionPage() {
  const { sessionId } = Route.useParams();
  const { mode } = Route.useSearch();
  const queryClient = useQueryClient();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-session", sessionId],
    queryFn: () => fetchMinisterialSessionState(sessionId),
    refetchOnWindowFocus: false,
  });

  const expiresAt = data?.session.expires_at ? new Date(data.session.expires_at).getTime() : null;
  const timed = mode === "strict" && expiresAt !== null;

  useEffect(() => {
    if (!timed) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timed]);

  const answersByQuestion = useMemo(() => {
    const map = new Map<string, number | null>();
    (data?.answers ?? []).forEach((a) => map.set(a.question_id, a.selected_index));
    return map;
  }, [data]);

  const answerMutation = useMutation({
    mutationFn: (input: { questionId: string; selectedIndex: number }) =>
      answerMinisterialQuestion({ sessionId, ...input }),
    onMutate: () => setActionError(null),
    onError: (err) => setActionError(safeExamMutationMessage(err, "answer")),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["ministerial-session", sessionId] }),
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل الجلسة…</StateMessage>;
  if (error || !data) return <StateMessage variant="error">{mapMinisterialError(error)}</StateMessage>;

  const questions = data.questions;
  const total = questions.length;
  const answeredCount = questions.filter(
    (q) => (answersByQuestion.get(q.question_id) ?? null) !== null,
  ).length;
  const current = questions[Math.min(currentIdx, Math.max(total - 1, 0))];
  const remainingMs = expiresAt ? expiresAt - now : null;
  const timeUp = remainingMs !== null && remainingMs <= 0;
  const locked = data.session.status !== "in_progress" || timeUp;

  const header = (
    <div className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
            {data.model ? `${data.model.subject_name} — ${modelTitle(data.model)}` : "نموذج وزاري"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "strict" ? "محاكاة الاختبار الحقيقي" : "وضع التدريب"} • {answeredCount}/{total}{" "}
            مُجاب
          </p>
        </div>
        {timed && (
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold ${
              timeUp ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
            }`}
          >
            <Timer className="h-4 w-4" aria-hidden />
            {formatRemaining(remainingMs ?? 0)}
          </span>
        )}
      </div>
      <Progress className="mt-3 h-2" value={total > 0 ? (answeredCount / total) * 100 : 0} />
    </div>
  );

  if (total === 0) {
    return (
      <div className="space-y-4" dir="rtl">
        {header}
        <StateMessage>لا توجد أسئلة في هذه الجلسة.</StateMessage>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      {header}

      {mode === "strict" && (
        <nav aria-label="شبكة الأسئلة" className="rounded-2xl border border-border bg-card p-3">
          <ul className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const answered = (answersByQuestion.get(q.question_id) ?? null) !== null;
              const active = idx === currentIdx;
              return (
                <li key={q.question_id}>
                  <button
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    aria-current={active}
                    className={`h-8 w-8 rounded-md border text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : answered
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          السؤال {currentIdx + 1} من {total}
        </p>
        {current.stimulus_text && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            {current.stimulus_text}
          </p>
        )}
        <h2 className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-foreground">
          {current.question_text}
        </h2>

        <ul className="mt-4 space-y-2">
          {optionsOf(current).map((opt, idx) => {
            const selected = (answersByQuestion.get(current.question_id) ?? null) === idx;
            return (
              <li key={`${current.question_id}-${opt.option_code}-${idx}`}>
                <button
                  type="button"
                  disabled={locked || answerMutation.isPending}
                  onClick={() =>
                    answerMutation.mutate({
                      questionId: current.question_id,
                      selectedIndex: idx,
                    })
                  }
                  className={`flex w-full items-start gap-2 rounded-xl border p-3 text-right text-sm transition disabled:opacity-60 ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]">
                    {opt.option_code}
                  </span>
                  <span className="whitespace-pre-wrap">{opt.body}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {actionError && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {actionError}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="gap-1"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
            السابق
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentIdx >= total - 1}
            onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
            className="gap-1"
          >
            التالي
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </section>

      {timeUp && (
        <StateMessage variant="error">
          انتهى الوقت المخصص للاختبار ولم يعد بالإمكان تعديل الإجابات.
        </StateMessage>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        {!confirmSubmit ? (
          <Button className="w-full gap-1" onClick={() => setConfirmSubmit(true)}>
            <Send className="h-4 w-4" aria-hidden />
            تسليم الاختبار
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              أجبت على {answeredCount} من {total} سؤالاً. هل تريد التسليم؟
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                التصحيح الآمن للنماذج الوزارية وعرض النتيجة والحلول لم يُفعّل بعد؛ سيتم إتاحته في
                مرحلة النتائج (14E). إجاباتك محفوظة على الخادم ولن تُفقد.
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmSubmit(false)}>
                متابعة الحل
              </Button>
              <Button className="flex-1" disabled>
                التسليم غير متاح بعد
              </Button>
            </div>
          </div>
        )}
      </section>

      <Link
        to="/ministerial-exams"
        className="inline-block text-sm text-muted-foreground underline underline-offset-4"
      >
        العودة إلى النماذج الوزارية
      </Link>
    </div>
  );
}

function formatRemaining(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
