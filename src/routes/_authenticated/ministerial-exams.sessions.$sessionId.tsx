import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  revealMinisterialAnswer,
  submitMinisterialSession,
  type MinisterialRevealResult,
  type MinisterialSessionQuestion,
} from "@/lib/ministerial/ministerial-student-api";
import { createSingleFlightGuard, safeExamMutationMessage } from "@/lib/exam-client-safety";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Send,
  Timer,
  XCircle,
} from "lucide-react";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submitGuard = useRef(createSingleFlightGuard());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reveals, setReveals] = useState<Record<string, MinisterialRevealResult>>({});
  const [tick, setTick] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-session", sessionId],
    queryFn: () => fetchMinisterialSessionState(sessionId),
    refetchOnWindowFocus: false,
  });

  // The attempt mode is authoritative on the server, never from the URL.
  const attemptMode = data?.session.attempt_mode ?? "training";
  const isStrict = attemptMode === "strict";

  // Timer is anchored to the server clock to survive client clock drift.
  const clockOffsetMs = useMemo(() => {
    if (!data?.session.server_now) return 0;
    return new Date(data.session.server_now).getTime() - Date.now();
  }, [data?.session.server_now]);

  const expiresAt = data?.session.expires_at ? new Date(data.session.expires_at).getTime() : null;
  const timed = isStrict && expiresAt !== null;
  const remainingMs = expiresAt !== null ? expiresAt - (Date.now() + clockOffsetMs) : null;
  const timeUp = remainingMs !== null && remainingMs <= 0;

  useEffect(() => {
    if (!timed) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [timed]);
  void tick;

  const answersByQuestion = useMemo(() => {
    const map = new Map<string, { code: string | null; revealedAt: string | null }>();
    (data?.answers ?? []).forEach((a) =>
      map.set(a.session_question_id, {
        code: a.selected_option_code,
        revealedAt: a.revealed_at,
      }),
    );
    return map;
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: () => submitMinisterialSession(sessionId),
    onMutate: () => setActionError(null),
    onError: (err) => setActionError(safeExamMutationMessage(err, "submit")),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ministerial-session", sessionId] });
      await queryClient.invalidateQueries({ queryKey: ["ministerial-attempts"] });
      await navigate({
        to: "/ministerial-exams/sessions/$sessionId/result",
        params: { sessionId },
      });
    },
  });

  const doSubmit = useCallback(() => {
    if (!submitGuard.current.enter()) return;
    submitMutation.mutate(undefined, { onSettled: () => submitGuard.current.leave() });
  }, [submitMutation]);

  // Deterministic auto-submit when the strict timer runs out.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!timeUp || autoSubmitted.current) return;
    if (data?.session.status !== "in_progress") return;
    autoSubmitted.current = true;
    doSubmit();
  }, [timeUp, data?.session.status, doSubmit]);

  const answerMutation = useMutation({
    mutationFn: (input: { sessionQuestionId: string; optionCode: string }) =>
      answerMinisterialQuestion({ sessionId, ...input }),
    onMutate: () => setActionError(null),
    onError: (err) => setActionError(safeExamMutationMessage(err, "answer")),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["ministerial-session", sessionId] }),
  });

  const revealMutation = useMutation({
    mutationFn: (sessionQuestionId: string) =>
      revealMinisterialAnswer({ sessionId, sessionQuestionId }),
    onMutate: () => setActionError(null),
    onError: (err) => setActionError(mapMinisterialError(err)),
    onSuccess: (result, sessionQuestionId) => {
      setReveals((prev) => ({ ...prev, [sessionQuestionId]: result }));
      void queryClient.invalidateQueries({ queryKey: ["ministerial-session", sessionId] });
    },
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل الجلسة…</StateMessage>;
  if (error || !data) return <StateMessage variant="error">{mapMinisterialError(error)}</StateMessage>;

  if (data.session.status !== "in_progress") {
    return (
      <div className="space-y-4" dir="rtl">
        <StateMessage>هذه المحاولة انتهت.</StateMessage>
        <Link
          to="/ministerial-exams/sessions/$sessionId/result"
          params={{ sessionId }}
          className="inline-block text-sm text-primary underline underline-offset-4"
        >
          عرض النتيجة والمراجعة
        </Link>
      </div>
    );
  }

  const questions = data.questions;
  const total = questions.length;
  const answeredCount = questions.filter(
    (q) => (answersByQuestion.get(q.session_question_id)?.code ?? null) !== null,
  ).length;
  const current = questions[Math.min(currentIdx, Math.max(total - 1, 0))];
  const locked = timeUp || submitMutation.isPending;

  const header = (
    <div className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
            {data.model ? `${data.model.subject_name} — ${modelTitle(data.model)}` : "نموذج وزاري"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isStrict ? "محاكاة الاختبار الحقيقي" : "وضع التدريب"} • {answeredCount}/{total} مُجاب
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

  const currentAnswer = answersByQuestion.get(current.session_question_id);
  const currentReveal = reveals[current.session_question_id];
  const revealedOnServer = Boolean(currentAnswer?.revealedAt);
  const questionLocked = locked || revealedOnServer;

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      {header}

      {isStrict && (
        <nav aria-label="شبكة الأسئلة" className="rounded-2xl border border-border bg-card p-3">
          <ul className="flex flex-wrap gap-1.5">
            {questions.map((q, idx) => {
              const answered =
                (answersByQuestion.get(q.session_question_id)?.code ?? null) !== null;
              const active = idx === currentIdx;
              return (
                <li key={q.session_question_id}>
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
          {optionsOf(current).map((opt) => {
            const selected = currentAnswer?.code === opt.option_code;
            const isCorrectOption =
              currentReveal && currentReveal.correct_option_code === opt.option_code;
            const isWrongPick = currentReveal && selected && currentReveal.is_correct === false;
            return (
              <li key={`${current.session_question_id}-${opt.option_code}`}>
                <button
                  type="button"
                  disabled={questionLocked || answerMutation.isPending}
                  onClick={() =>
                    answerMutation.mutate({
                      sessionQuestionId: current.session_question_id,
                      optionCode: opt.option_code,
                    })
                  }
                  className={`flex w-full items-start gap-2 rounded-xl border p-3 text-right text-sm transition disabled:opacity-70 ${
                    isCorrectOption
                      ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                      : isWrongPick
                        ? "border-destructive bg-destructive/10 text-foreground"
                        : selected
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

        {!isStrict && (
          <div className="mt-4">
            {currentReveal ? (
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                {currentReveal.manual_review_required ? (
                  <p className="flex items-center gap-2 font-semibold text-amber-600">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    هذا السؤال يحتاج تصحيحاً يدوياً.
                  </p>
                ) : currentReveal.is_correct ? (
                  <p className="flex items-center gap-2 font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    إجابة صحيحة
                  </p>
                ) : (
                  <p className="flex items-center gap-2 font-semibold text-destructive">
                    <XCircle className="h-4 w-4" aria-hidden />
                    إجابة غير صحيحة — الصحيح: {currentReveal.correct_option_code}
                  </p>
                )}
                {currentReveal.explanation && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {currentReveal.explanation}
                  </p>
                )}
                {currentReveal.lesson_id && (
                  <Link
                    to="/lessons/$lessonId"
                    params={{ lessonId: currentReveal.lesson_id }}
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden />
                    مراجعة الدرس {currentReveal.lesson_title ?? ""}
                  </Link>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-1"
                disabled={
                  !currentAnswer?.code || revealMutation.isPending || revealedOnServer || locked
                }
                onClick={() => revealMutation.mutate(current.session_question_id)}
              >
                <Eye className="h-4 w-4" aria-hidden />
                {revealedOnServer ? "تم كشف الحل مسبقاً" : "كشف الحل"}
              </Button>
            )}
            {!currentReveal && !currentAnswer?.code && (
              <p className="mt-2 text-xs text-muted-foreground">
                اختر إجابة أولاً. بعد كشف الحل لا يمكن تغيير إجابتك.
              </p>
            )}
          </div>
        )}

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
          انتهى الوقت المخصص للاختبار، ويجري تسليم إجاباتك تلقائياً.
        </StateMessage>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        {!confirmSubmit ? (
          <Button
            className="w-full gap-1"
            disabled={submitMutation.isPending}
            onClick={() => setConfirmSubmit(true)}
          >
            <Send className="h-4 w-4" aria-hidden />
            تسليم الاختبار
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              أجبت على {answeredCount} من {total} سؤالاً. هل تريد التسليم؟
            </p>
            {answeredCount < total && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>الأسئلة غير المُجابة ستُحتسب بدون درجة.</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={submitMutation.isPending}
                onClick={() => setConfirmSubmit(false)}
              >
                متابعة الحل
              </Button>
              <Button className="flex-1" disabled={submitMutation.isPending} onClick={doSubmit}>
                {submitMutation.isPending ? "جارٍ التسليم…" : "تأكيد التسليم"}
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
