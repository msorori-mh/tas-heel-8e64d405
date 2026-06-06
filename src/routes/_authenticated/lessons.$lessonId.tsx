import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { getLessonFileUrl } from "@/lib/api/lesson-file.functions";
import {
  Home,
  BookOpen,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Lock,
  Sparkles,
  Video,
  FlaskConical,
  Map as MapIcon,
  Link2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/lessons/$lessonId")({
  component: LessonPage,
});

type Lesson = {
  id: string;
  title: string;
  subject_id: string;
  unit_id: string | null;
  sort_order: number;
  content_text: string | null;
};

type Subject = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
};

type Unit = { id: string; title: string; sort_order: number; is_free: boolean } | null;

type LessonExtra = { id: string; title: string | null; video_url: string | null };

type ResourceRow = {
  id: string;
  resource_type: "video" | "mindmap" | "experiment" | "pdf" | "link";
  title: string;
  url: string;
  description: string | null;
  sort_order: number;
};

type SimulationRow = {
  id: string;
  title: string;
  description: string | null;
  phet_url: string;
};

type QuestionRow = {
  id: string;
  question_text: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  sort_order: number;
};

function LessonPage() {
  const { lessonId } = Route.useParams();
  const { profile } = useAuth();

  const { data: lesson, isLoading: loadingLesson, error: lessonErr } = useQuery({
    queryKey: ["lesson-meta", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,subject_id,unit_id,sort_order,content_text")
        .eq("id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return (data as Lesson | null) ?? null;
    },
  });

  const { data: subject } = useQuery({
    enabled: !!lesson?.subject_id,
    queryKey: ["lesson-subject", lesson?.subject_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,grade_id,curriculum_track_id")
        .eq("id", lesson!.subject_id)
        .maybeSingle();
      if (error) throw error;
      return (data as Subject | null) ?? null;
    },
  });

  const { data: unit } = useQuery({
    enabled: !!lesson?.unit_id,
    queryKey: ["lesson-unit", lesson?.unit_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id,title,sort_order")
        .eq("id", lesson!.unit_id!)
        .maybeSingle();
      if (error) throw error;
      return (data as Unit) ?? null;
    },
  });

  const accessible = useMemo(() => {
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

  const { data: book } = useQuery({
    enabled: !!lesson && accessible === true,
    queryKey: ["lesson-book", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_book_contents")
        .select("content")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return (data as { content: string | null } | null) ?? null;
    },
  });

  const { data: summary } = useQuery({
    enabled: !!lesson && accessible === true,
    queryKey: ["lesson-summary", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_summaries")
        .select("summary,key_points,study_tip")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return data as
        | { summary: string | null; key_points: unknown; study_tip: string | null }
        | null;
    },
  });

  const { data: questions } = useQuery({
    enabled: !!lesson && accessible === true,
    queryKey: ["lesson-questions", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id,question_text,options,correct_index,explanation,sort_order")
        .eq("lesson_id", lessonId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as QuestionRow[];
    },
  });

  if (loadingLesson) return <StateMessage variant="loading">جارٍ تحميل الدرس…</StateMessage>;
  if (lessonErr || !lesson) {
    return (
      <div className="space-y-4">
        <Breadcrumbs subjectName={null} subjectId={null} lessonName={null} />
        <StateMessage>هذا الدرس غير متاح.</StateMessage>
        <BackToApp />
      </div>
    );
  }
  if (subject && accessible === false) {
    return (
      <div className="space-y-4">
        <Breadcrumbs subjectName={null} subjectId={null} lessonName={null} />
        <StateMessage>هذا الدرس غير متاح.</StateMessage>
        <BackToApp />
      </div>
    );
  }

  const bookContent = (book?.content ?? lesson.content_text ?? "").trim();

  return (
    <article className="space-y-5">
      <Breadcrumbs
        subjectName={subject?.name ?? null}
        subjectId={subject?.id ?? null}
        lessonName={lesson.title}
      />

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-xl font-bold text-foreground">{lesson.title}</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {subject && (
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> {subject.name}
            </span>
          )}
          {unit && (
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" /> {unit.title}
            </span>
          )}
        </div>
      </header>

      <Section title="محتوى الدرس من الكتاب">
        {bookContent ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
            {bookContent}
          </div>
        ) : (
          <EmptyText>لم يُضف محتوى الكتاب لهذا الدرس بعد.</EmptyText>
        )}
      </Section>

      <Section title="ملخص الدرس">
        {summary?.summary ? (
          <>
            <p className="text-sm leading-relaxed text-card-foreground">{summary.summary}</p>
            {Array.isArray(summary.key_points) && summary.key_points.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pr-5 text-sm text-card-foreground">
                {(summary.key_points as unknown[]).map((p, i) => (
                  <li key={i}>{String(p)}</li>
                ))}
              </ul>
            )}
            {summary.study_tip && (
              <p className="mt-3 rounded-md bg-accent/10 p-2 text-xs">💡 {summary.study_tip}</p>
            )}
          </>
        ) : (
          <EmptyText>لم يُضف ملخص لهذا الدرس بعد.</EmptyText>
        )}
      </Section>

      <Section title="أسئلة الدرس" icon={<HelpCircle className="h-4 w-4 text-primary" />}>
        {questions && questions.length > 0 ? (
          <ol className="space-y-4">
            {questions.map((q, idx) => (
              <li key={q.id}>
                <QuestionCard index={idx + 1} q={q} />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyText>لم تُضف أسئلة لهذا الدرس بعد.</EmptyText>
        )}
      </Section>

      <div className="pt-1">
        {subject ? (
          <Button asChild variant="outline" className="gap-1">
            <Link to="/subjects/$subjectId" params={{ subjectId: subject.id }}>
              <Home className="h-4 w-4" /> العودة إلى المادة
            </Link>
          </Button>
        ) : (
          <BackToApp />
        )}
      </div>
    </article>
  );
}

function QuestionCard({ index, q }: { index: number; q: QuestionRow }) {
  const options = Array.isArray(q.options) ? (q.options as unknown[]) : [];
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const isCorrect = checked && selected === q.correct_index;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">
        <span className="text-muted-foreground">س{index}: </span>
        {q.question_text}
      </div>

      <div className="space-y-2">
        {options.map((opt, i) => {
          const active = selected === i;
          const showCorrectness = checked && active;
          const correctnessClass = showCorrectness
            ? isCorrect
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-destructive bg-destructive/10"
            : checked && i === q.correct_index
              ? "border-emerald-500 bg-emerald-500/5"
              : active
                ? "border-primary bg-primary/5"
                : "border-border bg-card";
          return (
            <button
              key={i}
              type="button"
              disabled={checked}
              onClick={() => setSelected(i)}
              className={`flex w-full items-start gap-2 rounded-lg border p-2 text-right text-sm transition-colors ${correctnessClass}`}
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs">
                {String.fromCharCode(0x0623 + i) /* أ ب ت ث … */}
              </span>
              <span className="min-w-0 flex-1 text-card-foreground">{String(opt)}</span>
            </button>
          );
        })}
      </div>

      {!checked ? (
        <Button
          className="mt-3"
          size="sm"
          disabled={selected === null}
          onClick={() => setChecked(true)}
        >
          تحقق من الإجابة
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <div
            className={`flex items-center gap-2 rounded-md p-2 text-sm font-semibold ${
              isCorrect
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> إجابة صحيحة
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" /> إجابة غير صحيحة
              </>
            )}
          </div>
          {q.explanation && (
            <p className="rounded-md bg-secondary/40 p-2 text-xs leading-relaxed text-muted-foreground">
              {q.explanation}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setChecked(false);
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Breadcrumbs({
  subjectName,
  subjectId,
  lessonName,
}: {
  subjectName: string | null;
  subjectId: string | null;
  lessonName: string | null;
}) {
  return (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">
        موادي
      </Link>
      <span className="mx-1">/</span>
      {subjectId && subjectName ? (
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId }}
          className="hover:text-primary"
        >
          {subjectName}
        </Link>
      ) : (
        <span>المادة</span>
      )}
      <span className="mx-1">/</span>
      <span className="text-foreground">{lessonName ?? "الدرس"}</span>
    </nav>
  );
}

function BackToApp() {
  return (
    <Button asChild variant="outline" className="gap-1">
      <Link to="/app">
        <Home className="h-4 w-4" /> العودة إلى موادي
      </Link>
    </Button>
  );
}
