import { CheckCircle2, XCircle } from "lucide-react";
import { redactExamAnswers } from "@/lib/exam-client-safety";

export type ExamAnswerItem = {
  question_id: string;
  selected_index: number | null;
  answered_at: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
};

export type ExamQuestionItem = {
  id: string;
  question_text: string;
  options: unknown;
  question_type: string | null;
  sort_order: number | null;
  points: number | null;
  correct_index: number | null;
  explanation: string | null;
};

export type ExamSessionRow = {
  id: string;
  status: "in_progress" | "submitted" | "expired";
  template_id: string;
  total_questions: number | null;
  answered_count: number | null;
  correct_count: number | null;
  score: number | null;
  percentage: number | null;
  result_json?: unknown;
};

export type ExamSessionState = {
  session: ExamSessionRow;
  template: { id: string; title: string; mode: string } | null;
  questions: ExamQuestionItem[];
  answers: ExamAnswerItem[];
  reveal: boolean;
};

export function ExamResultView({ state }: { state: ExamSessionState }) {
  const s = state.session;
  const score = s.percentage ?? s.score ?? 0;
  const msg =
    score >= 80
      ? "أداء ممتاز"
      : score >= 50
        ? "أداء جيد، واصل المراجعة"
        : "راجع الدروس ثم حاول مرة أخرى";

  const answersMap = new Map<string, ExamAnswerItem>();
  for (const a of state.answers) answersMap.set(a.question_id, a);
  const questions = redactExamAnswers(state.questions, state.reveal === true);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-card">
        <p className="text-2xl font-bold text-foreground">النتيجة: {Math.round(score)}%</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {s.correct_count ?? 0} صحيح من {s.total_questions ?? 0} • {s.answered_count ?? 0} مُجاب
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">{msg}</p>
      </div>

      <ol className="space-y-3">
        {questions.map((q, idx) => {
          const a = answersMap.get(q.id);
          const isCorrect = a?.is_correct === true;
          const opts = Array.isArray(q.options) ? (q.options as unknown[]) : [];
          return (
            <li key={q.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-medium text-foreground">{q.question_text}</p>
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
                            <span className="text-xs text-destructive">(إجابتك)</span>
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
    </div>
  );
}
