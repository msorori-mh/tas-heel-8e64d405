/**
 * 21B — "موادي" content for one semester.
 *
 * Extracted from /semesters/$semester so the index page can show the semester
 * tabs AND the subjects together (no empty intermediate screen).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { SubjectGroupsGrid, type SubjectMeta } from "@/components/home/SubjectGroupsGrid";
import {
  type Semester,
  buildSemesterMap,
  isSubjectVisibleForSemester,
} from "@/lib/subject-semester";
import { fetchStudentLessonVisibility } from "@/lib/lessons/lesson-lifecycle";
import { groupSubjectsByMainCategory } from "@/lib/subjects/subject-grouping";

type Subject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  semester: number | null;
  curriculum_track_id: string | null;
  group_code: string | null;
  group_name: string | null;
};

export function SemesterSubjectsView({ semester }: { semester: Semester }) {
  const { profile, user, isContentStaff } = useAuth();
  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const { data, isLoading, error, refetch } = useQuery({
    enabled: !!gradeKey,
    queryKey: [
      "semester-subjects",
      gradeKey,
      profile?.curriculum_track_id ?? null,
      semester,
      user?.id ?? null,
      isContentStaff === true,
    ],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error: subjectsError } = await supabase
        .from("subjects")
        .select("id,name,icon,color,sort_order,semester,curriculum_track_id,group_code,group_name")
        .eq("grade_id", gradeKey!)
        .order("sort_order");
      if (subjectsError) throw subjectsError;

      const trackId = profile?.curriculum_track_id ?? null;
      const byTrack = ((rows ?? []) as Subject[]).filter(
        (s) => s.curriculum_track_id === null || s.curriculum_track_id === trackId,
      );
      if (byTrack.length === 0) {
        return { subjects: [] as Subject[], meta: {} as Record<string, SubjectMeta> };
      }

      const subjectIds = byTrack.map((s) => s.id);
      const [unitsRes, lessonsRes] = await Promise.all([
        supabase.from("units").select("subject_id,semester").in("subject_id", subjectIds),
        supabase.from("lessons").select("id,subject_id,semester").in("subject_id", subjectIds),
      ]);
      if (unitsRes.error) throw unitsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const allLessonRows = (lessonsRes.data ?? []) as {
        id: string;
        subject_id: string;
        semester: number | null;
      }[];

      const visibility =
        isContentStaff === true
          ? null
          : await fetchStudentLessonVisibility(allLessonRows.map((lesson) => lesson.id));
      const lessonRows = visibility
        ? allLessonRows.filter((lesson) => visibility.get(lesson.id) !== false)
        : allLessonRows;

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
  const subjectMeta = data?.meta ?? {};
  const subjectGroups = subjects ? groupSubjectsByMainCategory(subjects) : [];
  const totalLessons =
    subjects?.reduce((sum, subject) => sum + (subjectMeta[subject.id]?.lessons ?? 0), 0) ?? 0;
  const completedLessons =
    subjects?.reduce((sum, subject) => sum + (subjectMeta[subject.id]?.completed ?? 0), 0) ?? 0;
  const readySubjects = subjectGroups.filter((group) =>
    group.subjects.some((subject) => (subjectMeta[subject.id]?.lessons ?? 0) > 0),
  ).length;
  const preparingSubjects = subjectGroups.length - readySubjects;

  return (
    <div className="space-y-3">
      {isLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}

      {error && (
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

      {!error && subjects && subjects.length === 0 && (
        <StateMessage>لا توجد مواد مضافة لهذا الفصل بعد. يمكنك اختيار الفصل الآخر.</StateMessage>
      )}

      {subjects && subjects.length > 0 && (
        <>
          <section
            aria-label="ملخص مواد الفصل"
            className="rounded-2xl border border-border/70 bg-card/85 p-3.5 shadow-sm sm:p-4"
          >
            <dl className="grid grid-cols-3 gap-2 text-center">
              <SummaryMetric label="المواد الأساسية" value={subjectGroups.length} tone="primary" />
              <SummaryMetric label="مواد جاهزة" value={readySubjects} tone="success" />
              <SummaryMetric
                label="دروس مكتملة"
                value={totalLessons > 0 ? `${completedLessons}/${totalLessons}` : "—"}
                tone="accent"
              />
            </dl>
            {preparingSubjects > 0 ? (
              <p className="mt-3 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-muted-foreground">
                {preparingSubjects === 1
                  ? "مادة واحدة ما زالت في مرحلة تجهيز المحتوى."
                  : `${preparingSubjects} مواد ما زالت في مرحلة تجهيز المحتوى.`}{" "}
                سيظهر زر البدء فور نشر أول درس، وتبقى كتب المنهج متاحة من البطاقة.
              </p>
            ) : null}
          </section>

          <SubjectGroupsGrid subjects={subjects} semester={semester as 1 | 2} meta={subjectMeta} />
        </>
      )}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "primary" | "success" | "accent";
}) {
  const toneClass = {
    primary: "bg-primary/6 text-primary",
    success: "bg-success/8 text-success",
    accent: "bg-accent/8 text-accent-foreground",
  }[tone];

  return (
    <div className={`rounded-xl px-2 py-2.5 ${toneClass}`}>
      <dt className="text-[11px] font-semibold text-muted-foreground sm:text-xs">{label}</dt>
      <dd className="mt-0.5 text-base font-black sm:text-lg">{value}</dd>
    </div>
  );
}

export default SemesterSubjectsView;
