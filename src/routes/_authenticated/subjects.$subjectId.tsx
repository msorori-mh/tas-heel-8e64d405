import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ExamTemplatesSection } from "@/components/exams/ExamTemplatesSection";
import {
  ClipboardList,
  ChevronLeft,
  BookOpen,
  CheckCircle2,
  Layers,
  FileText,
  Home,
  PlayCircle,
} from "lucide-react";
import { semesterLabel, type Semester } from "@/lib/subject-semester";
import { getSubjectIcon } from "@/lib/subjects/subject-icon";
import { STUDENT_FREE_ACCESS } from "@/lib/student-free-access";
import { OfflineSubjectPackCard } from "@/components/offline/OfflineSubjectPackCard";
import { fetchStudentLessonVisibility } from "@/lib/lessons/lesson-lifecycle";

const searchSchema = z.object({
  semester: fallback(z.union([z.literal(1), z.literal(2)]).optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/subjects/$subjectId")({
  validateSearch: zodValidator(searchSchema),
  component: SubjectIndexPage,
});

type Subject = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
  icon: string | null;
};

type Unit = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_free: boolean;
  semester: number | null;
};

type Lesson = {
  id: string;
  title: string;
  duration: string | null;
  unit_id: string | null;
  sort_order: number;
  semester: number | null;
};

function SubjectIndexPage() {
  const { subjectId } = Route.useParams();
  const { semester } = Route.useSearch();
  const { profile, user, isContentStaff } = useAuth();

  const { data: subject, isLoading: loadingSubject } = useQuery({
    queryKey: ["subject-meta", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,grade_id,curriculum_track_id,icon")
        .eq("id", subjectId)
        .maybeSingle();
      if (error) throw error;
      return data as Subject | null;
    },
  });

  const accessible = useMemo(() => {
    if (!subject || !profile) return null;
    const profileGrade = profile.grade_uuid ?? (profile.grade_id ? String(profile.grade_id) : null);
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

  const { data, isLoading, error } = useQuery({
    enabled: !!subject && accessible === true,
    queryKey: ["subject-index", subjectId, semester ?? null, isContentStaff === true],
    queryFn: async () => {
      const [u, l] = await Promise.all([
        supabase
          .from("units")
          .select("id,title,description,sort_order,is_free,semester")
          .eq("subject_id", subjectId)
          .order("sort_order")
          .order("title"),
        supabase
          .from("lessons")
          .select("id,title,duration,unit_id,sort_order,semester")
          .eq("subject_id", subjectId)
          .order("sort_order")
          .order("title"),
      ]);
      if (u.error) throw u.error;
      if (l.error) throw l.error;
      const allUnits = (u.data ?? []) as Unit[];
      const allLessons = (l.data ?? []) as Lesson[];
      // Filter by selected semester. Items with semester=null are shown in both
      // semesters so unconfigured content remains visible until the admin sets it.
      const units = semester
        ? allUnits.filter((x) => x.semester === null || x.semester === semester)
        : allUnits;
      const lessons = semester
        ? allLessons.filter((x) => x.semester === null || x.semester === semester)
        : allLessons;
      // CF10-R3 — server-side visibility gate: CF10-managed lessons whose
      // capabilities are all still DRAFT never appear in the student index.
      if (isContentStaff === true) return { units, lessons };
      const visibility = await fetchStudentLessonVisibility(lessons.map((x) => x.id));
      return { units, lessons: lessons.filter((x) => visibility.get(x.id) !== false) };
    },
  });

  const lessonIds = useMemo(() => (data?.lessons ?? []).map((l) => l.id), [data]);

  const { data: completedIds } = useQuery({
    enabled: !!user?.id && lessonIds.length > 0,
    queryKey: ["subject-progress", subjectId, user?.id, lessonIds.length],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("user_progress")
        .select("lesson_id,completed")
        .eq("user_id", user!.id)
        .in("lesson_id", lessonIds);
      if (err) throw err;
      return new Set((rows ?? []).filter((r) => r.completed).map((r) => r.lesson_id as string));
    },
  });

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

  const canAccessExams = STUDENT_FREE_ACCESS || Boolean(isAdmin) || Boolean(hasActiveSub);

  const backCrumbs = [
    { label: "الرئيسية", to: "/app" },
    { label: "موادي", to: "/semesters" },
    ...(semester
      ? [
          {
            label: semesterLabel(semester as Semester),
            to: "/semesters/$semester",
            params: { semester: String(semester) },
          },
        ]
      : []),
  ];

  if (loadingSubject) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (!subject || accessible === false) {
    return (
      <div className="space-y-4" dir="rtl">
        <Breadcrumbs items={[...backCrumbs, { label: "المادة" }]} />
        <StateMessage>هذه المادة غير متاحة.</StateMessage>
        <div className="text-center">
          <Button asChild variant="outline">
            <Link to="/semesters">
              <Home className="ml-1 h-4 w-4" /> العودة إلى موادي
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل الفهرس…</StateMessage>;
  if (error) return <StateMessage variant="error">تعذّر تحميل فهرس المادة.</StateMessage>;

  const units = data?.units ?? [];
  const lessons = data?.lessons ?? [];

  const lessonsByUnit = new Map<string | null, Lesson[]>();
  for (const ls of lessons) {
    const k = ls.unit_id ?? null;
    if (!lessonsByUnit.has(k)) lessonsByUnit.set(k, []);
    lessonsByUnit.get(k)!.push(ls);
  }
  const orphans = lessonsByUnit.get(null) ?? [];
  // Two officially supported shapes: Subject → Unit → Lesson, and Subject → Lesson
  // directly (all lessons have unit_id NULL). Never synthesize fake units.
  const hasUnits = units.length > 0;
  const hasAny = hasUnits || lessons.length > 0;

  const done = completedIds ?? new Set<string>();
  const completedCount = lessons.filter((l) => done.has(l.id)).length;
  const percent = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;
  const nextLesson = lessons.find((l) => !done.has(l.id));

  const SubjectIcon = getSubjectIcon(subject.name, subject.icon);

  // Open the unit that contains the next unfinished lesson.
  const defaultOpen =
    units.find((u) => (lessonsByUnit.get(u.id) ?? []).some((l) => !done.has(l.id)))?.id ??
    units[0]?.id;

  return (
    <div className="space-y-5" dir="rtl">
      <Breadcrumbs items={[...backCrumbs, { label: subject.name }]} />

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <SubjectIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-foreground">{subject.name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {hasUnits && (
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" /> {units.length} وحدة
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> {lessons.length} درس
              </span>
            </div>
          </div>
          {semester && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {semester === 1 ? "الفصل الأول" : "الفصل الثاني"}
            </span>
          )}
        </div>

        {lessons.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">تقدمك في المادة</span>
              <span className="font-semibold text-foreground">
                {completedCount}/{lessons.length} · {percent}%
              </span>
            </div>
            <Progress value={percent} className="h-2" />
          </div>
        )}

        {nextLesson && (
          <Button asChild variant="hero" className="mt-4 w-full gap-2 sm:w-auto">
            <Link to="/lessons/$lessonId" params={{ lessonId: nextLesson.id }}>
              <PlayCircle className="h-4 w-4" aria-hidden />
              {completedCount > 0 ? "أكمل من حيث توقفت" : "ابدأ أول درس"}
            </Link>
          </Button>
        )}
      </header>

      {!hasAny && <StateMessage>لم تُضاف دروس لهذه المادة بعد.</StateMessage>}

      {/* 18C — تحميل ملفات المادة للاستخدام دون إنترنت */}
      {lessons.length > 0 && (
        <OfflineSubjectPackCard subjectId={subjectId} subjectName={subject.name} />
      )}

      {hasAny &&
        (hasUnits ? (
          <Accordion type="single" collapsible defaultValue={defaultOpen} className="space-y-2.5">
            {units.map((u, idx) => (
              <UnitBlock
                key={u.id}
                unitId={u.id}
                index={idx + 1}
                title={u.title}
                description={u.description}
                isFree={u.is_free}
                lessons={lessonsByUnit.get(u.id) ?? []}
                completed={done}
              />
            ))}

            {orphans.length > 0 && (
              <UnitBlock
                value="__orphans"
                title="دروس أخرى"
                description={null}
                isFree={null}
                lessons={orphans}
                completed={done}
              />
            )}
          </Accordion>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-foreground">الدروس</h2>
            <LessonList lessons={lessons} completed={done} />
          </section>
        ))}

      <ExamTemplatesSection
        scope={{ kind: "subject", subjectId: subject.id }}
        canAccess={canAccessExams}
        title="اختبارات المادة"
        emptyMessage="لا توجد اختبارات شاملة للمادة بعد."
        lockedMessage="اختبارات المادة غير متاحة حالياً."
      />

      <div className="pt-2">
        <Button asChild variant="outline" className="gap-1">
          <Link to="/semesters">
            <Home className="h-4 w-4" /> العودة إلى موادي
          </Link>
        </Button>
      </div>
    </div>
  );
}

function UnitBlock({
  unitId,
  value,
  index,
  title,
  description,
  isFree,
  lessons,
  completed,
}: {
  unitId?: string;
  value?: string;
  index?: number;
  title: string;
  description: string | null;
  isFree: boolean | null;
  lessons: Lesson[];
  completed: Set<string>;
}) {
  const doneCount = lessons.filter((l) => completed.has(l.id)).length;

  return (
    <AccordionItem
      value={unitId ?? value ?? title}
      className="rounded-2xl border border-border bg-card px-4 shadow-card"
    >
      <AccordionTrigger className="gap-3 text-right hover:no-underline">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-bold text-foreground">
              {index ? <span className="text-muted-foreground">الوحدة {index}: </span> : null}
              {title}
            </h2>
            {isFree !== null && !STUDENT_FREE_ACCESS && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isFree
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                }`}
              >
                {isFree ? "مجانية" : "ضمن الاشتراك"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {lessons.length} درس · مكتمل {doneCount}
          </p>
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-4">
        {description && (
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}

        {lessons.length === 0 ? (
          unitId ? (
            <p className="text-xs text-muted-foreground">لا توجد دروس في هذه الوحدة بعد.</p>
          ) : null
        ) : (
          <LessonList lessons={lessons} completed={completed} />
        )}

        {unitId && (
          <div className="mt-3">
            <Link
              to="/units/$unitId/practice"
              params={{ unitId }}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/40"
              aria-label="اختبار الوحدة"
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <div className="min-w-0 text-right">
                <div className="font-medium">اختبار الوحدة</div>
                <div className="text-xs">اختبر فهمك بعد إكمال دروس الوحدة.</div>
              </div>
            </Link>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function LessonList({ lessons, completed }: { lessons: Lesson[]; completed: Set<string> }) {
  return (
    <ul className="space-y-2">
      {lessons.map((l) => {
        const isDone = completed.has(l.id);
        return (
          <li key={l.id}>
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: l.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-background p-3 transition-colors hover:bg-secondary/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    isDone ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{l.title}</div>
                  {l.duration && <div className="text-xs text-muted-foreground">{l.duration}</div>}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
