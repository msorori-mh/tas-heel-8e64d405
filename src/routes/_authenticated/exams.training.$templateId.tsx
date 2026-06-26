import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import {
  Home,
  Send,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
} from "lucide-react";
import { mapStartExamError } from "@/lib/exam-start-errors";

export const Route = createFileRoute(
  "/_authenticated/exams/training/$templateId",
)({
  component: TrainingExamPage,
});

type SessionRow = {
  id: string;
  status: "in_progress" | "submitted" | "expired";
  template_id: string;
  total_questions: number | null;
  answered_count: number | null;
  correct_count: number | null;
  score: number | null;
  percentage: number | null;
  result_json: unknown;
};

type QuestionItem = {
  id: string;
  question_text: string;
  options: unknown;
  question_type: string | null;
  sort_order: number | null;
  points: number | null;
  correct_index: number | null;
  explanation: string | null;
};

type AnswerItem = {
  question_id: string;
  selected_index: number | null;
  answered_at: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
};

type SessionState = {
  session: SessionRow;
  template: { id: string; title: string; mode: string } | null;
  questions: QuestionItem[];
  answers: AnswerItem[];
  reveal: boolean;
};

function TrainingExamPage() {
  const { templateId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // On mount: find existing in_progress session or create one
  useEffect(() => {
    if (!user?.id || sessionId) return;
    let cancelled = false;
    (async () => {
      setStarting(true);
      setStartError(null);
      try {
        const { data: existing, error: selErr } = await supabase
          .from("exam_sessions")
          .select("id")
          .eq("template_id", templateId)
          .eq("user_id", user.id)
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (selErr) throw selErr;
        if (cancelled) return;
        if (existing?.id) {
          setSessionId(existing.id);
          return;
        }
        const { data: newId, error: rpcErr } = await supabase.rpc(
          "start_exam_session",
          { _template_id: templateId },
        );
        if (rpcErr) throw rpcErr;
        if (cancelled) return;
        setSessionId(newId as unknown as string);
      } catch (e) {
        if (!cancelled) setStartError(mapStartExamError(e));
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, templateId, sessionId]);

  const stateQuery = useQuery({
    enabled: !!sessionId,
    queryKey: ["exam-session-state", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_session_state", {
        _session_id: sessionId!,
      });
      if (error) throw error;
      return data as unknown as SessionState;
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (vars: { questionId: string; selectedIndex: number }) => {
      const { error } = await supabase.rpc("answer_exam_question", {
        _session_id: sessionId!,
        _question_id: vars.questionId,
        _selected_index: vars.selectedIndex,
      });
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({
        queryKey: ["exam-session-state", sessionId],
      });
      const prev = queryClient.getQueryData<SessionState>([
        "exam-session-state",
        sessionId,
      ]);
      if (prev) {
        const answers = [...prev.answers];
        const idx = answers.findIndex((a) => a.question_id === vars.questionId);
        const updated: AnswerItem = {
          question_id: vars.questionId,
          selected_index: vars.selectedIndex,
          answered_at: new Date().toISOString(),
          is_correct: null,
          points_awarded: null,
        };
        if (idx >= 0) answers[idx] = updated;
        else answers.push(updated);
        queryClient.setQueryData<SessionState>(
          ["exam-session-state", sessionId],
          { ...prev, answers },
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(
          ["exam-session-state", sessionId],
          ctx.prev,
        );
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_exam_session", {
        _session_id: sessionId!,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["exam-session-state", sessionId],
      });
    },
  });

  const state = stateQuery.data;
  const questions = useMemo(() => state?.questions ?? [], [state]);
  const answersMap = useMemo(() => {
    const m = new Map<string, AnswerItem>();
    for (const a of state?.answers ?? []) m.set(a.question_id, a);
    return m;
  }, [state]);

  const Breadcrumb = (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">
        موادي
      </Link>
      <span className="mx-1">/</span>
      <span className="text-foreground">تدريب</span>
    </nav>
  );

  if (starting || (!sessionId && !startError))
    return <StateMessage variant="loading">جارٍ تجهيز جلسة التدريب…</StateMessage>;
  if (startError)
    return (
      <div className="space-y-4">
        {Breadcrumb}
        <StateMessage variant="error">{startError}</StateMessage>
        <Button asChild variant="outline" className="gap-1">
          <Link to="/app">
            <Home className="h-4 w-4" /> العودة
          </Link>
        </Button>
      </div>
    );
  if (stateQuery.isLoading)
    return <StateMessage variant="loading">جارٍ تحميل الأسئلة…</StateMessage>;
  if (stateQuery.error || !state)
    return <StateMessage variant="error">تعذّر تحميل الجلسة.</StateMessage>;

  if (questions.length === 0) {
    return (
      <div className="space-y-4">
        {Breadcrumb}
        <StateMessage>لا توجد أسئلة في هذا الاختبار.</StateMessage>
      </div>
    );
  }

  const submitted = state.session.status !== "in_progress";

  if (submitted) {
    return (
      <ResultView
        state={state}
        onRetry={() => {
          setSessionId(null);
          setCurrentIdx(0);
        }}
      />
    );
  }

  const q = questions[Math.min(currentIdx, questions.length - 1)];
  const opts = Array.isArray(q.options) ? (q.options as unknown[]) : [];
  const currentAnswer = answersMap.get(q.id);
  const answeredCount = state.answers.filter(
    (a) => a.selected_index !== null,
  ).length;
  const totalCount = questions.length;
  const allAnswered = answeredCount >= totalCount;

  return (
    <div className="space-y-4">
      {Breadcrumb}

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-lg font-bold text-foreground">
          {state.template?.title ?? "تدريب"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          السؤال {currentIdx + 1} من {totalCount} • تمت الإجابة على{" "}
          {answeredCount}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: `${Math.round(((currentIdx + 1) / totalCount) * 100)}%`,
            }}
          />
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-start gap-2">
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            {currentIdx + 1}
          </span>
          <p className="text-sm font-medium text-foreground">
            {q.question_text}
          </p>
        </div>
        {opts.length > 0 && (
          <ul className="mt-3 space-y-2">
            {opts.map((opt, i) => {
              const isSelected = currentAnswer?.selected_index === i;
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={answerMutation.isPending}
                    onClick={() =>
                      answerMutation.mutate({
                        questionId: q.id,
                        selectedIndex: i,
                      })
                    }
                    className={[
                      "w-full text-right rounded-md border px-3 py-3 text-sm transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/30 text-foreground hover:bg-muted/60",
                      answerMutation.isPending && "opacity-80",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={[
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        ].join(" ")}
                      >
                        {isSelected && (
                          <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </span>
                      {String(opt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          className="gap-1"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
        >
          <ChevronRight className="h-4 w-4" />
          السابق
        </Button>
        {currentIdx < totalCount - 1 ? (
          <Button
            className="gap-1"
            onClick={() =>
              setCurrentIdx((i) => Math.min(totalCount - 1, i + 1))
            }
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            className="gap-1"
            disabled={!allAnswered || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="h-4 w-4" />
            {submitMutation.isPending ? "جارٍ التسليم…" : "إنهاء التدريب"}
          </Button>
        )}
      </div>

      {!allAnswered && currentIdx === totalCount - 1 && (
        <p className="text-center text-xs text-muted-foreground">
          أجب على جميع الأسئلة قبل التسليم.
        </p>
      )}
      {submitMutation.isError && (
        <p className="text-center text-xs text-destructive">
          تعذّر تسليم التدريب. حاول مرة أخرى.
        </p>
      )}
    </div>
  );
}

function ResultView({
  state,
  onRetry,
}: {
  state: SessionState;
  onRetry: () => void;
}) {
  const s = state.session;
  const score = s.percentage ?? s.score ?? 0;
  const msg =
    score >= 80
      ? "أداء ممتاز"
      : score >= 50
        ? "أداء جيد، واصل المراجعة"
        : "راجع الدروس ثم حاول مرة أخرى";

  const answersMap = new Map<string, AnswerItem>();
  for (const a of state.answers) answersMap.set(a.question_id, a);

  return (
    <div className="space-y-4">
      <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
        <Link to="/app" className="hover:text-primary">
          موادي
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">نتيجة التدريب</span>
      </nav>

      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-card">
        <p className="text-2xl font-bold text-foreground">
          النتيجة: {Math.round(score)}%
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {s.correct_count ?? 0} صحيح من {s.total_questions ?? 0} •{" "}
          {s.answered_count ?? 0} مُجاب
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">{msg}</p>
      </div>

      <ol className="space-y-3">
        {state.questions.map((q, idx) => {
          const a = answersMap.get(q.id);
          const isCorrect = a?.is_correct === true;
          const opts = Array.isArray(q.options) ? (q.options as unknown[]) : [];
          return (
            <li
              key={q.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {q.question_text}
                  </p>
                </div>
                <span
                  className={[
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    isCorrect
                      ? "bg-green-500/15 text-green-700 dark:text-green-400"
                      : "bg-destructive/15 text-destructive",
                  ].join(" ")}
                >
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> صحيح
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5" /> غير صحيح
                    </>
                  )}
                </span>
              </div>

              {opts.length > 0 && (
                <ul className="mt-3 space-y-2 ps-8">
                  {opts.map((opt, i) => {
                    const isStudent = a?.selected_index === i;
                    const isRight = q.correct_index === i;
                    return (
                      <li
                        key={i}
                        className={[
                          "rounded-md border px-3 py-2 text-sm",
                          isRight
                            ? "border-green-500/50 bg-green-500/10 text-foreground"
                            : isStudent
                              ? "border-destructive/50 bg-destructive/10 text-foreground"
                              : "border-border bg-muted/30 text-foreground",
                        ].join(" ")}
                      >
                        <span className="inline-flex items-center gap-2">
                          {String(opt)}
                          {isRight && (
                            <span className="text-xs text-green-700 dark:text-green-400">
                              (الإجابة الصحيحة)
                            </span>
                          )}
                          {isStudent && !isRight && (
                            <span className="text-xs text-destructive">
                              (إجابتك)
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {q.explanation && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
                  <p className="mb-1 font-semibold">الشرح</p>
                  <p>{q.explanation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button asChild variant="outline" className="gap-1">
          <Link to="/app">
            <Home className="h-4 w-4" /> العودة
          </Link>
        </Button>
        <Button className="gap-1" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> محاولة جديدة
        </Button>
      </div>
    </div>
  );
}
