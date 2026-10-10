import { useStudentView } from "@/hooks/use-student-view";
import { useConnectivity } from "@/hooks/use-connectivity";
import { readSavedSubjects } from "@/lib/offline/student-shell-cache";
import { ConnectionRequired } from "@/components/offline/ConnectionRequired";
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
  SubjectLessonBrowser,
  type Unit,
  type Lesson,
} from "@/components/subjects/SubjectLessonBrowser";
import { ExamTemplatesSection } from "@/components/exams/ExamTemplatesSection";
import { Layers, FileText, Home, PlayCircle } from "lucide-react";
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

function SubjectIndexPage() {
  const { subjectId } = Route.useParams();
  const { semester } = Route.useSearch();
  const { profile, user, isContentStaff } = useAuth();
  const online = useConnectivity();

  const { data: subject, isLoading: loadingSubject } = useStudentView({
    offline: async (): Promise<Subject | null> =>
      (await readSavedSubjects(user!.id)).find((s) => s.id === subjectId) ?? null,
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

  const { data, isLoading, error } = useStudentView({
    offline: async (): Promise<{ units: Unit[]; lessons: Lesson[] }> => ({
      units: [],
      lessons:
        (await readSavedSubjects(user!.id, semester)).find((s) => s.id === subjectId)?.lessons ??
        [],
    }),
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

  const { data: completedIds } = useStudentView({
    offline: async (): Promise<string[]> => [],
    enabled: !!user?.id && lessonIds.length > 0,
    queryKey: ["subject-progress", subjectId, user?.id, lessonIds.length],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("user_progress")
        .select("lesson_id,completed")
        .eq("user_id", user!.id)
        .in("lesson_id", lessonIds);
      if (err) throw err;
      return (rows ?? []).filter((r) => r.completed).map((r) => r.lesson_id as string);
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
        {online ? (
          <StateMessage>هذه المادة غير متاحة.</StateMessage>
        ) : (
          <ConnectionRequired message="هذه المادة لم تُنزّل على جهازك بعد. اتصل بالإنترنت لتنزيلها، أو اختر إحدى موادك المحفوظة." />
        )}
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

  // Both unit-based and direct lessons are supported by the browser below.
  const hasUnits = units.length > 0;
  const hasAny = hasUnits || lessons.length > 0;

  const done = new Set(completedIds ?? []);
  const completedCount = lessons.filter((l) => done.has(l.id)).length;
  const percent = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;
  const nextLesson = lessons.find((l) => !done.has(l.id));

  const SubjectIcon = getSubjectIcon(subject.name, subject.icon);

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-hidden space-y-5" dir="rtl">
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

      {hasAny && (
        <SubjectLessonBrowser
          key={`${subjectId}:${semester ?? "all"}`}
          units={units}
          lessons={lessons}
          completed={done}
        />
      )}

      {online ? (
        <ExamTemplatesSection
          scope={{ kind: "subject", subjectId: subject.id }}
          canAccess={canAccessExams}
          title="اختبارات المادة"
          emptyMessage="لا توجد اختبارات شاملة للمادة بعد."
          lockedMessage="اختبارات المادة غير متاحة حالياً."
        />
      ) : (
        <ConnectionRequired message="اختبارات المادة الشاملة تحتاج اتصالًا بالإنترنت. أسئلة الدروس التي نزّلتها متاحة داخل كل درس." />
      )}

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
