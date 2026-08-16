import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs as SharedBreadcrumbs } from "@/components/student/Breadcrumbs";

import { Button } from "@/components/ui/button";
import { getLessonFileUrl } from "@/lib/api/lesson-file.functions";
import {
  getLessonPublishedHtmlResourcesFn,
  createSignedStudentAccessUrlFn,
  requestFreshStudentHtmlSignedUrl,
} from "@/lib/api/html-pipeline.functions";
import { PublishedHtmlResourceViewer } from "@/components/lessons/PublishedHtmlResourceViewer";
import {
  ExternalLessonDelivery,
  type PrimaryLessonResource,
} from "@/components/lessons/ExternalLessonDelivery";
import {
  computeLessonCapabilities,
  computeLessonProgress,
  parseLessonTitle,
  visibleLessonCapabilities,
  type LessonCapability,
  type LessonCapabilityType,
} from "@/lib/lessons/lesson-capabilities";

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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Trophy,
  Target,
  ScrollText,
  Library,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { STUDENT_FREE_ACCESS } from "@/lib/student-free-access";

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

type LessonExtra = {
  id: string;
  title: string | null;
  has_video: boolean;
  has_content_pdf: boolean;
  external_video_url: string | null;
};

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
      // SECURITY: use SECURITY DEFINER RPC which omits correct_index/explanation.
      const { data, error } = await supabase.rpc("get_lesson_quiz_questions", {
        _lesson_id: lessonId,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        question_text: r.question_text,
        options: r.options,
        sort_order: r.sort_order ?? 0,
      })) as QuestionRow[];
    },
  });

  // ── Phase N2D: unit-level access gate for enhancements ──
  // Free-access pivot: skip subscription RPC for UI gating.
  const { data: hasActiveSub } = useQuery({
    enabled: !!profile?.user_id && !STUDENT_FREE_ACCESS,
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
    enabled: !!profile?.user_id && !STUDENT_FREE_ACCESS,
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
    STUDENT_FREE_ACCESS ||
    Boolean(isAdmin) ||
    unitIsFree ||
    Boolean(hasActiveSub);

  // Lesson extras (existence flags + safe external URL) — fetched only when allowed
  const { data: lessonExtra } = useQuery({
    enabled: !!lesson && accessible === true && canAccessEnhancements,
    queryKey: ["lesson-extra", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_lesson_safe_extras" as never,
        { _lesson_id: lessonId } as never,
      );
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as any) : (data as any);
      if (!row) return null;
      return {
        id: row.id,
        title: row.title ?? null,
        has_video: !!row.has_video,
        has_content_pdf: !!row.has_content_pdf,
        external_video_url: row.external_video_url ?? null,
      } as LessonExtra;
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

  // LESSON_EXTERNAL_PDF_DELIVERY_13F — primary external resource (Drive PDF…).
  // Fails soft: if the column is not present yet, the lesson renders normally.
  const { data: primaryResource } = useQuery({
    enabled: !!lesson && accessible === true && canAccessEnhancements,
    queryKey: ["lesson-primary-resource", lessonId],
    retry: false,
    queryFn: async (): Promise<PrimaryLessonResource | null> => {
      const { data, error } = await (supabase.from("lesson_resources") as any)
        .select("id,resource_type,title,url,description")
        .eq("lesson_id", lessonId)
        .eq("is_primary", true)
        .maybeSingle();
      if (error) return null;
      return (data as PrimaryLessonResource | null) ?? null;
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

  // Published HTML interactive resources (mind_map_html, practical_experiment_html, summary_html)
  const getLessonHtmlResources = useServerFn(getLessonPublishedHtmlResourcesFn);
  const refreshSignedUrl = useServerFn(createSignedStudentAccessUrlFn);
  const handleReloadSignedUrl = useCallback(
    (resourceId: string) =>
      () => requestFreshStudentHtmlSignedUrl(refreshSignedUrl, resourceId),
    [refreshSignedUrl],
  );
  const { data: htmlResources, isLoading: htmlResourcesLoading, error: htmlResourcesError } = useQuery({
    enabled: !!lesson && accessible === true && canAccessEnhancements,
    queryKey: ["lesson-published-html-resources", lessonId],
    queryFn: async () => {
      const result = await getLessonHtmlResources({ data: { lessonId } });
      return result.resources;
    },
  });

  const htmlMindMaps = (htmlResources ?? []).filter((r) => r.resourceType === "mind_map_html");
  const htmlExperiments = (htmlResources ?? []).filter((r) => r.resourceType === "practical_experiment_html");
  const htmlSummaries = (htmlResources ?? []).filter((r) => r.resourceType === "summary_html");

  // Detect availability of a training template (for the journey CTA hint).
  const { data: trainingTemplates } = useQuery({
    enabled: !!lesson && accessible === true,
    queryKey: ["lesson-training-templates-count", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_templates")
        .select("id,mode,questions:exam_template_questions(count)")
        .eq("is_active", true)
        .eq("lesson_id", lessonId);
      if (error) throw error;
      const rows = ((data ?? []) as any[]).filter(
        (r) => (r.questions?.[0]?.count ?? 0) > 0,
      );
      return rows.length;
    },
  });

  // Sibling lessons for previous/next navigation inside the same subject.
  const { data: siblings } = useQuery({
    enabled: !!lesson?.subject_id && accessible === true,
    queryKey: ["lesson-siblings", lesson?.subject_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,sort_order")
        .eq("subject_id", lesson!.subject_id)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; sort_order: number }[];
    },
  });

  const siblingIndex = siblings?.findIndex((s) => s.id === lessonId) ?? -1;
  const prevLesson = siblingIndex > 0 ? siblings![siblingIndex - 1] : null;
  const nextLesson =
    siblings && siblingIndex >= 0 && siblingIndex < siblings.length - 1
      ? siblings[siblingIndex + 1]
      : null;


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

  const titleParts = parseLessonTitle(lesson.title);

  const capabilities = computeLessonCapabilities({
    deliveryMode: (lesson as { delivery_mode?: string }).delivery_mode ?? null,
    bookContent: book?.content ?? null,
    inlineContent: lesson.content_text,
    primaryResource: primaryResource ?? null,
    resources: (resources ?? []).map((r) => ({
      id: r.id,
      resource_type: r.resource_type,
      title: r.title,
      url: r.url,
      description: r.description,
    })),
    simulationsCount: simulations?.length ?? 0,
    htmlMindMapsCount: htmlMindMaps.length,
    htmlExperimentsCount: htmlExperiments.length,
    htmlSummariesCount: htmlSummaries.length,
    summaryText: summary?.summary ?? null,
    explanationsCount: explanations?.length ?? 0,
    questionsCount: questions?.length ?? 0,
    lessonExamCount: trainingTemplates ?? 0,
    hasLessonVideoFlag: lessonExtra?.has_video === true,
    enhancementsAccessible: canAccessEnhancements,
    progress: progressRow
      ? { completed: progressRow.completed === true, quizScore: progressRow.quiz_score }
      : null,
  });

  const actions = visibleLessonCapabilities(capabilities);
  const lessonProgress = computeLessonProgress(capabilities);
  const primaryCapability = capabilities.find((c) => c.type === "PRIMARY_CONTENT");
  const primaryUnavailable = !primaryCapability?.available || !primaryCapability?.studentVisible;

  const bookContent = (book?.content ?? lesson.content_text ?? "").trim();

  const renderCapabilityBody = (capability: LessonCapability) => {
    switch (capability.type) {
      case "PRIMARY_CONTENT":
        return capability.source === "primary_resource" && primaryResource ? (
          <ExternalLessonDelivery resource={primaryResource} />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
            {bookContent}
          </div>
        );

      case "SUMMARY":
        return (
          <>
            {htmlSummaries.length > 0 && (
              <div className="mb-4 space-y-4">
                {htmlSummaries.map((r) => (
                  <PublishedHtmlResourceViewer
                    key={r.resourceId}
                    resource={r}
                    onReloadSignedUrl={handleReloadSignedUrl(r.resourceId)}
                  />
                ))}
              </div>
            )}
            {summary?.summary && summary.summary.trim().length > 0 && (
              <>
                <p className="text-sm leading-relaxed text-card-foreground">{summary.summary}</p>
                {Array.isArray(summary.key_points) && (summary.key_points as unknown[]).length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pr-5 text-sm text-card-foreground">
                    {(summary.key_points as unknown[]).map((p, i) => (
                      <li key={i}>{String(p)}</li>
                    ))}
                  </ul>
                )}
                {summary.study_tip && (
                  <p className="mt-3 flex items-start gap-2 rounded-md bg-accent/10 p-2 text-xs">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    {summary.study_tip}
                  </p>
                )}
              </>
            )}
          </>
        );

      case "EXPLANATION":
        return (
          <div className="space-y-3">
            {(explanations ?? []).map((e) => (
              <article key={e.id} className="rounded-xl border border-border bg-background p-3">
                {e.title && (
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{e.title}</h3>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
                  {e.content}
                </p>
              </article>
            ))}
          </div>
        );

      case "MINDMAP":
        return (
          <div className="space-y-4">
            {htmlMindMaps.map((r) => (
              <PublishedHtmlResourceViewer
                key={r.resourceId}
                resource={r}
                onReloadSignedUrl={handleReloadSignedUrl(r.resourceId)}
              />
            ))}
            {mindmaps.map((r) => (
              <ResourceCard key={r.id} resource={r} lessonId={lessonId} />
            ))}
          </div>
        );

      case "PRACTICAL":
        return (
          <div className="space-y-4">
            {htmlExperiments.map((r) => (
              <PublishedHtmlResourceViewer
                key={r.resourceId}
                resource={r}
                onReloadSignedUrl={handleReloadSignedUrl(r.resourceId)}
              />
            ))}
            {experiments.map((r) => (
              <ResourceCard key={r.id} resource={r} lessonId={lessonId} />
            ))}
            {(simulations ?? []).length > 0 && (
              <ul className="space-y-2">
                {(simulations ?? []).map((s) => (
                  <li key={s.id}>
                    <EnhancementItemRow
                      item={{
                        id: s.id,
                        title: s.title,
                        description: s.description,
                        url: s.phet_url,
                      }}
                      lessonId={lessonId}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );

      case "VIDEO":
        return (
          <ul className="space-y-2">
            {videos.map((r) => (
              <li key={r.id}>
                <EnhancementItemRow
                  item={{ id: r.id, title: r.title, description: r.description, url: r.url }}
                  lessonId={lessonId}
                />
              </li>
            ))}
            {lessonExtra?.has_video && (
              <li>
                <EnhancementItemRow
                  item={{
                    id: `lesson-video-${lessonExtra.id}`,
                    title: "فيديو الدرس",
                    description: null,
                    url: lessonExtra.external_video_url ?? "lesson-internal://video",
                  }}
                  lessonId={lessonId}
                />
              </li>
            )}
          </ul>
        );

      case "ASSESSMENT":
        return (
          <ol className="space-y-4">
            {(questions ?? []).map((q, idx) => (
              <li key={q.id}>
                <QuestionCard index={idx + 1} q={q} />
              </li>
            ))}
          </ol>
        );

      case "LESSON_EXAM":
        return (
          <ExamTemplatesSection
            scope={{ kind: "lesson", lessonId }}
            canAccess={canAccessEnhancements}
            title="اختبارات الدرس"
            emptyMessage="لا توجد اختبارات لهذا الدرس بعد."
            lockedMessage="اختبارات الدرس غير متاحة حالياً."
          />
        );

      case "EXTRA_RESOURCES":
        return (
          <div className="space-y-3">
            {extras.map((r) => (
              <ResourceCard key={r.id} resource={r} lessonId={lessonId} />
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <article className="space-y-4" dir="rtl">
      <Breadcrumbs
        subjectName={subject?.name ?? null}
        subjectId={subject?.id ?? null}
        lessonName={titleParts.main}
      />

      {/* Lesson header */}
      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        {titleParts.context && (
          <p className="mb-1 text-[11px] text-muted-foreground">{titleParts.context}</p>
        )}
        <h1 className="text-lg font-bold text-foreground">{titleParts.main}</h1>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
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
        {lessonProgress.measurable && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">التقدم في الدرس</span>
              <span className="font-semibold text-foreground">
                {lessonProgress.numerator}/{lessonProgress.denominator} · {lessonProgress.percent}%
              </span>
            </div>
            <Progress value={lessonProgress.percent} className="h-2" />
          </div>
        )}
      </header>

      {primaryUnavailable && (
        <section
          role="status"
          className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card"
        >
          محتوى الدرس لم يُضف بعد.
        </section>
      )}

      {/* Content-driven learning actions — only what actually exists */}
      {actions.length > 0 && (
        <div className="space-y-3">
          {actions.map((capability, index) => (
            <JourneyCard
              key={capability.type}
              stepNumber={index + 1}
              icon={<CapabilityIcon type={capability.type} />}
              title={capability.label}
              description={capability.description}
              ctaLabel={capability.action}
              defaultOpen={index === 0 && capability.type === "PRIMARY_CONTENT"}
            >
              {renderCapabilityBody(capability)}
            </JourneyCard>
          ))}
        </div>
      )}


      <nav
        aria-label="التنقل بين الدروس"
        className="grid grid-cols-2 gap-2.5 border-t border-border/60 pt-4"
      >
        {prevLesson ? (
          <Button asChild variant="outline" className="justify-start gap-1.5">
            <Link to="/lessons/$lessonId" params={{ lessonId: prevLesson.id }}>
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{prevLesson.title}</span>
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {nextLesson ? (
          <Button asChild variant="hero" className="justify-end gap-1.5">
            <Link to="/lessons/$lessonId" params={{ lessonId: nextLesson.id }}>
              <span className="truncate">{nextLesson.title}</span>
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </nav>

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

function JourneyCard({
  stepNumber,
  icon,
  title,
  description,
  ctaLabel,
  ctaDisabled,
  children,
}: {
  stepNumber: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaDisabled: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={() => !ctaDisabled && setOpen((v) => !v)}
        disabled={ctaDisabled}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-right transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              خطوة {stepNumber}
            </span>
            <h2 className="truncate text-base font-bold text-foreground">{title}</h2>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0 text-muted-foreground">
          {ctaDisabled ? (
            <span className="text-[11px]">{ctaLabel}</span>
          ) : (
            <div className="flex items-center gap-1 text-xs font-medium text-primary">
              <span>{open ? "إغلاق" : ctaLabel}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </div>
          )}
        </div>
        {/* unused icon prop kept for future visual variant */}
        <span className="sr-only">{icon}</span>
      </button>
      {open && !ctaDisabled && (
        <div className="border-t border-border bg-background/40 p-4">{children}</div>
      )}
    </section>
  );
}


function QuestionCard({ index, q }: { index: number; q: QuestionRow }) {
  const options = Array.isArray(q.options) ? (q.options as unknown[]) : [];
  const [selected, setSelected] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    is_correct: boolean;
    correct_index: number | null;
    explanation: string | null;
  } | null>(null);
  const checked = result !== null;
  const isCorrect = checked && result!.is_correct;

  const handleCheck = async () => {
    if (selected === null) return;
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc("check_lesson_question", {
        _question_id: q.id,
        _selected_index: selected,
      });
      if (error) throw error;
      const r = data as { is_correct: boolean; correct_index: number; explanation: string | null };
      setResult({
        is_correct: !!r.is_correct,
        correct_index: typeof r.correct_index === "number" ? r.correct_index : null,
        explanation: r.explanation ?? null,
      });
    } finally {
      setChecking(false);
    }
  };

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
            : checked && result!.correct_index !== null && i === result!.correct_index
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
          disabled={selected === null || checking}
          onClick={handleCheck}
        >
          {checking ? "جارٍ التحقق…" : "تحقق من الإجابة"}
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
          {result!.explanation && (
            <p className="rounded-md bg-secondary/40 p-2 text-xs leading-relaxed text-muted-foreground">
              {result!.explanation}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setResult(null);
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
    <SharedBreadcrumbs
      items={[
        { label: "الرئيسية", to: "/app" },
        { label: "موادي", to: "/semesters" },
        subjectId && subjectName
          ? { label: subjectName, to: "/subjects/$subjectId", params: { subjectId } }
          : { label: "المادة" },
        { label: lessonName ?? "الدرس" },
      ]}
    />
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
    const isInternalLessonMedia = item.url.startsWith("lesson-internal://");
    const payload = isInternalLessonMedia
      ? { lessonId, kind: item.url.slice("lesson-internal://".length) as "video" | "pdf" }
      : { lessonId, url: item.url };
    getUrl({ data: payload })
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


