import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { SubjectGroupsGrid, type SubjectMeta } from "@/components/home/SubjectGroupsGrid";
import {
  type Semester,
  buildSemesterMap,
  isSubjectVisibleForSemester,
  semesterLabel,
} from "@/lib/subject-semester";

export const Route = createFileRoute("/_authenticated/semesters/$semester")({
  beforeLoad: ({ params }) => {
    if (params.semester !== "1" && params.semester !== "2") throw notFound();
  },
  component: SemesterSubjectsPage,
});

type Subject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  semester: number | null;
  curriculum_track_id: string | null;
};

function SemesterSubjectsPage() {
  const { semester: raw } = Route.useParams();
  const semester = (Number(raw) === 2 ? 2 : 1) as Semester;
  const { profile, user, loading } = useAuth();
  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const {
    data,
    isLoading: subjLoading,
    error: subjError,
    refetch,
  } = useQuery({
    enabled: !!gradeKey,
    queryKey: [
      "semester-subjects",
      gradeKey,
      profile?.curriculum_track_id ?? null,
      semester,
      user?.id ?? null,
    ],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("subjects")
        .select("id,name,icon,color,sort_order,semester,curriculum_track_id")
        .eq("grade_id", gradeKey!)
        .order("sort_order");
      if (error) throw error;

      const trackId = profile?.curriculum_track_id ?? null;
      const byTrack = ((rows ?? []) as Subject[]).filter(
        (s) => s.curriculum_track_id === null || s.curriculum_track_id === trackId,
      );
      if (byTrack.length === 0) return { subjects: [] as Subject[], meta: {} as Record<string, SubjectMeta> };

      const subjectIds = byTrack.map((s) => s.id);
      const [unitsRes, lessonsRes] = await Promise.all([
        supabase.from("units").select("subject_id,semester").in("subject_id", subjectIds),
        supabase.from("lessons").select("id,subject_id,semester").in("subject_id", subjectIds),
      ]);
      if (unitsRes.error) throw unitsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const lessonRows = (lessonsRes.data ?? []) as {
        id: string;
        subject_id: string;
        semester: number | null;
      }[];

      const unitSemesters = buildSemesterMap(
        (unitsRes.data ?? []) as { subject_id: string; semester: number | null }[],
      );
      const lessonSemesters = buildSemesterMap(lessonRows);

      const subjects = byTrack.filter((s) =>
        isSubjectVisibleForSemester(s, semester, unitSemesters, lessonSemesters),
      );

      const meta: Record<string, SubjectMeta> = {};
      for (const s of subjects) meta[s.id] = { lessons: 0, completed: 0 };

      const lessonToSubject = new Map<string, string>();
      for (const l of lessonRows) {
        if (!meta[l.subject_id]) continue;
        if (l.semester !== null && l.semester !== semester) continue;
        meta[l.subject_id].lessons += 1;
        lessonToSubject.set(l.id, l.subject_id);
      }

      if (user?.id && lessonToSubject.size > 0) {
        const { data: progress } = await supabase
          .from("user_progress")
          .select("lesson_id,completed")
          .eq("user_id", user.id)
          .eq("completed", true);
        for (const p of progress ?? []) {
          const sid = lessonToSubject.get(p.lesson_id as string);
          if (sid && meta[sid]) meta[sid].completed += 1;
        }
      }

      return { subjects, meta };
    },
  });

  const subjects = data?.subjects;

  if (loading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;

  return (
    <div className="space-y-4" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "الرئيسية", to: "/app" },
          { label: "موادي", to: "/semesters" },
          { label: semesterLabel(semester) },
        ]}
      />

      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-headline truncate text-foreground">مواد {semesterLabel(semester)}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            تعرض هنا مواد {semesterLabel(semester)} المطابقة لمنهجك وصفك.
            {subjects ? ` (${subjects.length})` : ""}
          </p>
        </div>
        <Link
          to="/semesters/$semester"
          params={{ semester: semester === 1 ? "2" : "1" }}
          className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          {semester === 1 ? "الفصل الثاني" : "الفصل الأول"}
        </Link>
      </header>

      {subjLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}

      {subjError && (
        <div className="space-y-3">
          <StateMessage variant="error">
            تعذّر تحميل المواد. تحقق من اتصالك ثم حاول مرة أخرى.
          </StateMessage>
          <div className="text-center">
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {!subjError && subjects && subjects.length === 0 && (
        <div className="space-y-3">
          <StateMessage>لا توجد مواد مضافة لهذا الفصل بعد. يمكنك اختيار الفصل الآخر.</StateMessage>
        </div>
      )}

      {subjects && subjects.length > 0 && (
        <SubjectGroupsGrid subjects={subjects} semester={semester as 1 | 2} meta={data?.meta} />
      )}
    </div>
  );
}
