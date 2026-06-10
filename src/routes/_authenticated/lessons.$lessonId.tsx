import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { getLessonFileUrl } from "@/lib/api/lesson-file.functions";
import { ExamTemplatesSection } from "@/components/exams/ExamTemplatesSection";
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
  FileText,
  Loader2,
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
        .select("id,title,sort_order,is_free")
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

  // ── Phase N2D: unit-level access gate for enhancements ──
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

  const unitIsFree = unit?.is_free === true;
  const canAccessEnhancements =
    Boolean(isAdmin) || unitIsFree || Boolean(hasActiveSub);

  // Lesson extras (video_url) — fetched only when allowed
  const { data: lessonExtra } = useQuery({
    enabled: !!lesson && accessible === true && canAccessEnhancements,
    queryKey: ["lesson-extra", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,video_url")
        .eq("id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return (data as LessonExtra | null) ?? null;
    },
  });

  const {
    data: resources,
    isLoading: resourcesLoading,
    error: resourcesError,
  } = useQuery({
    enabled: !!lesson && accessible === true && canAccessEnhancements,
    queryKey: ["lesson-resources", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_resources")
        .select("id,resource_type,title,url,description,sort_order")
        .eq("lesson_id", lessonId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
  });

  const { data: simulations } = useQuery({
    enabled: !!lesson && accessible === true && canAccessEnhancements,
    queryKey: ["lesson-simulations", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_simulations")
        .select("id,title,description,phet_url")
        .eq("lesson_id", lessonId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as SimulationRow[];
    },
  });

  const mindmaps = (resources ?? []).filter((r) => r.resource_type === "mindmap");
  const videos = (resources ?? []).filter((r) => r.resource_type === "video");
  const experiments = (resources ?? []).filter((r) => r.resource_type === "experiment");
  const extras = (resources ?? []).filter(
    (r) => r.resource_type === "pdf" || r.resource_type === "link",
  );

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

      <Section title="موارد الدرس" icon={<Link2 className="h-4 w-4 text-primary" />}>
        {!canAccessEnhancements && !unitIsFree ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>موارد الدرس متاحة ضمن الاشتراك.</span>
          </div>
        ) : resourcesLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ تحميل الموارد…
          </div>
        ) : resourcesError ? (
          <p className="text-sm text-destructive">تعذر تحميل موارد الدرس.</p>
        ) : resources && resources.length > 0 ? (
          <div className="space-y-3">
            {resources.map((r) => (
              <ResourceCard key={r.id} resource={r} lessonId={lessonId} />
            ))}
          </div>
        ) : (
          <EmptyText>لا توجد موارد لهذا الدرس حاليًا.</EmptyText>
        )}
      </Section>

      <Section
        title="إضافات تساعدك تفهم أكثر"
        icon={<Sparkles className="h-4 w-4 text-primary" />}
      >
        {!canAccessEnhancements && !unitIsFree && (
          <p className="mb-3 rounded-lg border border-dashed border-border bg-muted/30 p-2 text-xs leading-relaxed text-muted-foreground">
            هذه الإضافات ضمن اشتراك الوحدة. المحتوى الأساسي للدرس متاح لك بالكامل.
          </p>
        )}

        <EnhancementGroup
          title="الخريطة الذهنية"
          icon={<MapIcon className="h-4 w-4 text-primary" />}
          locked={!canAccessEnhancements}
          lockedMessage="الخريطة الذهنية متاحة ضمن الاشتراك."
          emptyMessage="لم تُضَف خريطة ذهنية لهذا الدرس بعد."
          items={mindmaps.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            url: r.url,
          }))}
          lessonId={lessonId}
        />

        <EnhancementGroup
          title="شرح الفيديو"
          icon={<Video className="h-4 w-4 text-primary" />}
          locked={!canAccessEnhancements}
          lockedMessage="شرح الفيديو متاح ضمن الاشتراك."
          emptyMessage="لم يُضَف شرح فيديو لهذا الدرس بعد."
          items={[
            ...videos.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description,
              url: r.url,
            })),
            ...(lessonExtra?.video_url
              ? [
                  {
                    id: `lesson-video-${lessonExtra.id}`,
                    title: "فيديو الدرس",
                    description: null,
                    url: lessonExtra.video_url,
                  },
                ]
              : []),
          ]}
          lessonId={lessonId}
        />

        <EnhancementGroup
          title="التطبيق العملي / التجربة"
          icon={<FlaskConical className="h-4 w-4 text-primary" />}
          locked={!canAccessEnhancements}
          lockedMessage="التجربة العملية متاحة ضمن الاشتراك."
          emptyMessage="لا توجد تجربة عملية لهذا الدرس."
          items={[
            ...experiments.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description,
              url: r.url,
            })),
            ...(simulations ?? []).map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description,
              url: s.phet_url,
            })),
          ]}
          lessonId={lessonId}
        />

        <EnhancementGroup
          title="موارد إضافية"
          icon={<Link2 className="h-4 w-4 text-primary" />}
          locked={!canAccessEnhancements}
          lockedMessage="الموارد الإضافية متاحة ضمن الاشتراك."
          emptyMessage="لا توجد موارد إضافية لهذا الدرس."
          items={extras.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            url: r.url,
          }))}
          lessonId={lessonId}
        />
      </Section>

      <ExamTemplatesSection
        scope={{ kind: "lesson", lessonId }}
        canAccess={canAccessEnhancements}
        title="اختبارات الدرس"
        emptyMessage="لا توجد اختبارات لهذا الدرس بعد."
        lockedMessage="اختبارات الدرس متاحة ضمن الاشتراك."
      />

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

type EnhancementItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
};

function EnhancementGroup({
  title,
  icon,
  locked,
  lockedMessage,
  emptyMessage,
  items,
  lessonId,
}: {
  title: string;
  icon: React.ReactNode;
  locked: boolean;
  lockedMessage: string;
  emptyMessage: string;
  items: EnhancementItem[];
  lessonId: string;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon} {title}
      </div>
      {locked ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span>{lockedMessage}</span>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id}>
              <EnhancementItemRow item={it} lessonId={lessonId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isSafeHttpUrl(value: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isExternalUrl(u: string) {
  return /^https?:\/\//i.test(u.trim());
}

function EnhancementItemRow({
  item,
  lessonId,
}: {
  item: EnhancementItem;
  lessonId: string;
}) {
  const getUrl = useServerFn(getLessonFileUrl);
  const externalRaw = isExternalUrl(item.url);
  const externalSafe = isSafeHttpUrl(item.url);
  const externalUnsafe = externalRaw && !externalSafe;
  const [resolved, setResolved] = useState<string | null>(
    externalSafe ? item.url : null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(
    externalUnsafe ? "رابط المورد غير صالح." : null,
  );

  useEffect(() => {
    if (externalSafe) {
      setResolved(item.url);
      return;
    }
    if (externalUnsafe) {
      setErr("رابط المورد غير صالح.");
      setResolved(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getUrl({ data: { lessonId, url: item.url } })
      .then((res) => {
        if (!cancelled) setResolved(res.url);
      })
      .catch(() => {
        if (!cancelled) setErr("تعذّر تحميل الملف.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.url, lessonId, getUrl, externalSafe, externalUnsafe]);

  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="text-sm font-semibold text-foreground">{item.title}</div>
      {item.description && (
        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
      )}
      <div className="mt-2">
        {loading && <span className="text-xs text-muted-foreground">جارٍ التحضير…</span>}
        {err && <span className="text-xs text-destructive">{err}</span>}
        {resolved && !loading && !err && (
          <a
            href={resolved}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Link2 className="h-3.5 w-3.5" />
            {item.url.trim().startsWith("supabase-storage://") ? "فتح PDF" : "فتح"}
          </a>
        )}
      </div>
    </div>
  );
}

function ResourceTypeBadge({ type }: { type: string }) {
  const config: Record<
    string,
    { label: string; icon: React.ReactNode }
  > = {
    pdf: { label: "ملف PDF", icon: <FileText className="h-3.5 w-3.5" /> },
    video: { label: "فيديو", icon: <Video className="h-3.5 w-3.5" /> },
    link: { label: "رابط", icon: <Link2 className="h-3.5 w-3.5" /> },
    mindmap: { label: "خريطة ذهنية", icon: <MapIcon className="h-3.5 w-3.5" /> },
    experiment: { label: "تجربة", icon: <FlaskConical className="h-3.5 w-3.5" /> },
  };
  const c = config[type] ?? { label: type, icon: null };
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">
      {c.icon} {c.label}
    </span>
  );
}

function ResourceCard({
  resource,
  lessonId,
}: {
  resource: ResourceRow;
  lessonId: string;
}) {
  const getUrl = useServerFn(getLessonFileUrl);
  const isStorageRef = resource.url.trim().startsWith("supabase-storage://");
  const safeHttp = !isStorageRef && isSafeHttpUrl(resource.url);

  const [resolved, setResolved] = useState<string | null>(
    safeHttp ? resource.url : null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isStorageRef) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getUrl({ data: { lessonId, url: resource.url } })
      .then((res) => {
        if (!cancelled) setResolved(res.url);
      })
      .catch(() => {
        if (!cancelled) setErr("تعذّر تحضير الملف.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isStorageRef, resource.url, lessonId, getUrl]);

  const buttonLabel = isStorageRef ? "فتح PDF" : "فتح المورد";
  const showOpen = resolved && !loading && !err;
  const showInvalid = !isStorageRef && !safeHttp;

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{resource.title}</div>
          {resource.description && (
            <p className="mt-1 text-xs text-muted-foreground">{resource.description}</p>
          )}
          <div className="mt-2">
            <ResourceTypeBadge type={resource.resource_type} />
          </div>
        </div>
        <div className="shrink-0">
          {loading && (
            <span className="text-xs text-muted-foreground">جارٍ التحضير…</span>
          )}
          {err && <span className="text-xs text-destructive">{err}</span>}
          {showInvalid && (
            <span className="text-xs text-muted-foreground">
              رابط المورد غير صالح.
            </span>
          )}
          {showOpen && (
            <a
              href={resolved}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {buttonLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


