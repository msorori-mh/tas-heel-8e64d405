import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Home, ClipboardList, Lock, Send, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/units/$unitId/practice")({
  component: UnitPracticePage,
});

type UnitRow = { id: string; title: string; subject_id: string; is_free: boolean };
type SubjectRow = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
};

function UnitPracticePage() {
  const { unitId } = Route.useParams();
  const { profile } = useAuth();

  const { data: unit, isLoading: loadingUnit, error: unitErr } = useQuery({
    queryKey: ["unit-practice-unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id,title,subject_id,is_free")
        .eq("id", unitId)
        .maybeSingle();
      if (error) throw error;
      return (data as UnitRow | null) ?? null;
    },
  });

  const { data: subject } = useQuery({
    enabled: !!unit?.subject_id,
    queryKey: ["unit-practice-subject", unit?.subject_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,grade_id,curriculum_track_id")
        .eq("id", unit!.subject_id)
        .maybeSingle();
      if (error) throw error;
      return (data as SubjectRow | null) ?? null;
    },
  });

  const { data: hasActiveSub } = useQuery({
    enabled: !!profile?.user_id,
    queryKey: ["has-active-subscription", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_active_subscription", {
        _user_id: profile!.user_id,
      });
      if (error) return false;
      return Boolean(data);
    },
  });

  const { data: isAdmin } = useQuery({
    enabled: !!profile?.user_id,
    queryKey: ["is-admin", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: profile!.user_id,
        _role: "admin",
      });
      if (error) return false;
      return Boolean(data);
    },
  });

  const accessibleGradeTrack = useMemo(() => {
    if (!subject || !profile) return null;
    const profileGrade =
      profile.grade_uuid ?? (profile.grade_id ? String(profile.grade_id) : null);
    if (profileGrade && subject.grade_id !== profileGrade) return false;
    if (
      subject.curriculum_track_id &&
      profile.curriculum_track_id &&
      subject.curriculum_track_id !== profile.curriculum_track_id
    ) {
      return false;
    }
    return true;
  }, [subject, profile]);

  if (loadingUnit) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (unitErr) return <StateMessage variant="error">تعذّر تحميل بيانات الوحدة.</StateMessage>;
  if (!unit) return <StateMessage>هذه الوحدة غير موجودة.</StateMessage>;

  const subjectId = unit.subject_id;

  const BackBtn = (
    <div className="pt-2">
      <Button asChild variant="outline" className="gap-1">
        <Link to="/subjects/$subjectId" params={{ subjectId }}>
          <Home className="h-4 w-4" /> العودة إلى المادة
        </Link>
      </Button>
    </div>
  );

  const Breadcrumb = (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">موادي</Link>
      <span className="mx-1">/</span>
      <Link to="/subjects/$subjectId" params={{ subjectId }} className="hover:text-primary">
        {subject?.name ?? "المادة"}
      </Link>
      <span className="mx-1">/</span>
      <span className="text-foreground">اختبار الوحدة</span>
    </nav>
  );

  if (subject && accessibleGradeTrack === false) {
    return (
      <div className="space-y-4">
        {Breadcrumb}
        <StateMessage>هذا الاختبار غير متاح.</StateMessage>
        {BackBtn}
      </div>
    );
  }

  const canAccessPractice =
    Boolean(isAdmin) || unit.is_free === true || Boolean(hasActiveSub);

  return (
    <div className="space-y-5">
      {Breadcrumb}

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-xl font-bold text-foreground">اختبار الوحدة</h1>
        {unit.title && (
          <p className="mt-1 text-sm text-muted-foreground">{unit.title}</p>
        )}
      </header>

      {canAccessPractice ? (
        <PracticeQuestionsList unitId={unit.id} subjectId={subjectId} />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-foreground">
            اختبار هذه الوحدة متاح ضمن الاشتراك.
          </p>
        </section>
      )}

      {BackBtn}
    </div>
  );
}

type LessonRow = { id: string; sort_order: number | null };
type QuestionRow = {
  id: string;
  lesson_id: string | null;
  question_text: string;
  options: unknown;
  question_type: string | null;
  sort_order: number | null;
};

type ServerResult = {
  attempt_id?: string;
  total: number;
  answered: number;
  correct: number;
  score: number;
  per_question: { question_id: string; is_correct: boolean }[];
};

function PracticeQuestionsList({ unitId, subjectId }: { unitId: string; subjectId: string }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState<ServerResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: lessons } = useQuery({
    queryKey: ["practice-lessons", unitId, subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,sort_order")
        .eq("unit_id", unitId)
        .eq("subject_id", subjectId);
      if (error) throw error;
      return (data as LessonRow[]) ?? [];
    },
  });

  const lessonIds = (lessons ?? []).map((l) => l.id);
  const lessonOrder = new Map<string, number>(
    (lessons ?? []).map((l) => [l.id, l.sort_order ?? 9999])
  );

  const { data: questions, isLoading } = useQuery({
    enabled: lessonIds.length > 0,
    queryKey: ["practice-questions", unitId, lessonIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id,lesson_id,question_text,options,question_type,sort_order")
        .in("lesson_id", lessonIds);
      if (error) throw error;
      return (data as QuestionRow[]) ?? [];
    },
  });

  if (lessons && lessonIds.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
        <p className="mt-4 text-sm text-muted-foreground">
          لم تُضاف أسئلة اختبار لهذه الوحدة بعد.
        </p>
      </section>
    );
  }

  if (isLoading || !questions) {
    return <StateMessage variant="loading">جارٍ تحميل الأسئلة…</StateMessage>;
  }

  if (questions.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
        <p className="mt-4 text-sm text-muted-foreground">
          لم تُضاف أسئلة اختبار لهذه الوحدة بعد.
        </p>
      </section>
    );
  }

  const sorted = [...questions].sort((a, b) => {
    const la = lessonOrder.get(a.lesson_id ?? "") ?? 9999;
    const lb = lessonOrder.get(b.lesson_id ?? "") ?? 9999;
    if (la !== lb) return la - lb;
    const sa = a.sort_order ?? 9999;
    const sb = b.sort_order ?? 9999;
    if (sa !== sb) return sa - sb;
    return (a.question_text ?? "").localeCompare(b.question_text ?? "");
  });

  const answeredCount = Object.keys(answers).length;
  const totalCount = sorted.length;
  const isLocked = serverResult !== null;

  const resultByQuestion = new Map<string, boolean>(
    (serverResult?.per_question ?? []).map((p) => [p.question_id, p.is_correct])
  );

  const handleSubmit = async () => {
    if (submitting || serverResult) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = Object.entries(answers).map(([question_id, selected_index]) => ({
        question_id,
        selected_index,
      }));
      const { data, error } = await supabase.rpc("submit_unit_practice_attempt", {
        _unit_id: unitId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _answers: payload as any,
      });
      if (error) {
        setSubmitError("تعذر حفظ نتيجة الاختبار.");
        return;
      }
      const res = data as unknown as { error?: string } & Partial<ServerResult>;
      if (res && typeof res === "object" && "error" in res && res.error) {
        const map: Record<string, string> = {
          forbidden: "هذا الاختبار غير متاح.",
          not_found: "الوحدة غير موجودة.",
          no_valid_questions: "لا توجد أسئلة صالحة للتصحيح.",
          unauthorized: "يجب تسجيل الدخول.",
        };
        setSubmitError(map[res.error] ?? "تعذر حفظ نتيجة الاختبار.");
        return;
      }
      setServerResult(data as unknown as ServerResult);
    } catch {
      setSubmitError("تعذر حفظ نتيجة الاختبار.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setServerResult(null);
    setSubmitError(null);
    setAnswers({});
  };

  const scoreMessage = (score: number) =>
    score >= 80
      ? "أداء ممتاز"
      : score >= 50
        ? "أداء جيد، واصل المراجعة"
        : "راجع دروس الوحدة ثم حاول مرة أخرى";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">أسئلة اختبار الوحدة</h2>
        <span className="text-xs text-muted-foreground">
          تمت الإجابة على {answeredCount} من {totalCount}
        </span>
      </div>

      {serverResult && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-card">
          <p className="text-2xl font-bold text-foreground">
            النتيجة: {serverResult.score}%
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {serverResult.correct} صحيح من {serverResult.total}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {scoreMessage(serverResult.score)}
          </p>
          {serverResult.attempt_id && (
            <p className="mt-1 text-xs text-muted-foreground">
              تم حفظ محاولتك.
            </p>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {sorted.map((q, idx) => {
          const opts = Array.isArray(q.options) ? (q.options as unknown[]) : [];
          const selected = answers[q.id];
          const qResult = resultByQuestion.get(q.id);
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
                  <p className="text-sm font-medium text-foreground">{q.question_text}</p>
                </div>
                {isLocked && qResult !== undefined && (
                  <span
                    className={[
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      qResult
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-destructive/15 text-destructive",
                    ].join(" ")}
                  >
                    {qResult ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> صحيح
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" /> غير صحيح
                      </>
                    )}
                  </span>
                )}
              </div>
              {opts.length > 0 && (
                <ul className="mt-3 space-y-2 ps-8">
                  {opts.map((opt, i) => {
                    const isSelected = selected === i;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          disabled={isLocked || submitting}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: i }))
                          }
                          className={[
                            "w-full text-right rounded-md border px-3 py-2 text-sm transition-colors",
                            isSelected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-muted/30 text-foreground hover:bg-muted/60",
                            (isLocked || submitting) && "opacity-80 cursor-not-allowed",
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
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {submitError
              ? submitError
              : serverResult
                ? "تم تصحيح الاختبار."
                : answeredCount < totalCount
                  ? "أجب على جميع الأسئلة قبل التسليم."
                  : "جميع الأسئلة مُجابة. يمكنك التسليم الآن."}
          </p>
          {serverResult ? (
            <Button
              variant="outline"
              className="w-full gap-1 sm:w-auto"
              onClick={handleRetry}
            >
              <RotateCcw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          ) : (
            <Button
              disabled={answeredCount < totalCount || submitting}
              className="w-full gap-1 sm:w-auto"
              onClick={handleSubmit}
            >
              <Send className="h-4 w-4" />
              {submitting ? "جاري التصحيح..." : "تسليم الاختبار"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
