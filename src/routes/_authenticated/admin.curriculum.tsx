import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Layers,
  Loader2,
  Route as RouteIcon,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/curriculum")({
  component: AdminCurriculumPage,
  head: () => ({
    meta: [
      { title: "هيكل المنهج | لوحة تمكين" },
      {
        name: "description",
        content: "استعراض جاهزية الصفوف والمواد والمسارات والوحدات والدروس.",
      },
    ],
  }),
});

type Grade = { id: string; name: string; sort_order: number };
type Subject = {
  id: string;
  name: string;
  code: string | null;
  grade_id: string;
  sort_order: number;
};
type Track = { id: string; track_name: string; track_code: string };
type Assignment = {
  subject_id: string;
  curriculum_track_id: string;
  track?: Track | null;
};
type Unit = {
  id: string;
  title: string;
  code: string | null;
  subject_id: string;
  sort_order: number;
};
type Lesson = {
  id: string;
  title: string;
  slug: string;
  subject_id: string;
  unit_id: string | null;
  sort_order: number;
};

function AdminCurriculumPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  const treeQ = useQuery({
    enabled,
    queryKey: ["admin-curriculum", "readiness-v2"],
    queryFn: async () => {
      const [grades, subjects, assignments, units, lessons] = await Promise.all([
        supabase.from("grades").select("id, name, sort_order").order("sort_order"),
        supabase
          .from("subjects")
          .select("id, name, code, grade_id, sort_order")
          .order("sort_order"),
        supabase
          .from("subject_curriculum_tracks")
          .select(
            "subject_id, curriculum_track_id, track:curriculum_tracks!subject_curriculum_tracks_curriculum_track_id_fkey(id, track_name, track_code)",
          )
          .eq("is_active", true),
        supabase
          .from("units")
          .select("id, title, code, subject_id, sort_order")
          .order("sort_order"),
        supabase
          .from("lessons")
          .select("id, title, slug, subject_id, unit_id, sort_order")
          .order("sort_order"),
      ]);
      for (const result of [grades, subjects, assignments, units, lessons]) {
        if (result.error) throw result.error;
      }
      return {
        grades: (grades.data ?? []) as Grade[],
        subjects: (subjects.data ?? []) as Subject[],
        assignments: (assignments.data ?? []) as unknown as Assignment[],
        units: (units.data ?? []) as Unit[],
        lessons: (lessons.data ?? []) as Lesson[],
      };
    },
  });

  const maps = useMemo(() => {
    const tracks = new Map<string, Assignment[]>();
    const units = new Map<string, Unit[]>();
    const lessons = new Map<string, Lesson[]>();
    for (const item of treeQ.data?.assignments ?? []) {
      tracks.set(item.subject_id, [...(tracks.get(item.subject_id) ?? []), item]);
    }
    for (const item of treeQ.data?.units ?? []) {
      units.set(item.subject_id, [...(units.get(item.subject_id) ?? []), item]);
    }
    for (const item of treeQ.data?.lessons ?? []) {
      lessons.set(item.subject_id, [...(lessons.get(item.subject_id) ?? []), item]);
    }
    return { tracks, units, lessons };
  }, [treeQ.data]);

  const totals = useMemo(() => {
    const data = treeQ.data;
    if (!data) return null;
    return {
      subjects: data.subjects.length,
      units: data.units.length,
      lessons: data.lessons.length,
      directLessons: data.lessons.filter((lesson) => !lesson.unit_id).length,
    };
  }, [treeQ.data]);

  if (loading || !enabled) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          {loading ? "جارٍ التحقق من الصلاحيات…" : "ليست لديك صلاحية الوصول لهذه الصفحة."}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">هيكل المنهج</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              استعراض الجاهزية والعلاقات الفعلية فقط؛ تتم الإدارة من صفحات المادة والوحدات والدروس
              والكتب.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <a
              href="/admin/subjects"
              className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
            >
              المواد والمسارات
            </a>
            <a
              href="/admin/units"
              className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
            >
              الوحدات
            </a>
            <a
              href="/admin/lessons/"
              className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
            >
              الدروس
            </a>
            <a
              href="/admin/textbooks"
              className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted"
            >
              كتب المواد
            </a>
          </div>
        </header>

        {totals && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "المواد", value: totals.subjects },
              { label: "الوحدات", value: totals.units },
              { label: "الدروس", value: totals.lessons },
              { label: "دروس مرتبطة مباشرة", value: totals.directLessons },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          المواد التي لا يتضمن كتابها وحدات صحيحة بالكامل: تظهر دروسها كـ
          <strong className="mx-1">مرتبطة بالمادة مباشرة</strong>
          ولا يُنشئ النظام وحدة وهمية لها.
        </div>

        {treeQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : treeQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
            تعذر تحميل هيكل المنهج.
          </div>
        ) : (
          <div className="space-y-3">
            {treeQ.data?.grades.map((grade) => {
              const gradeSubjects = treeQ.data.subjects.filter(
                (subject) => subject.grade_id === grade.id,
              );
              if (gradeSubjects.length === 0) return null;
              const gradeOpen = expandedGrades[grade.id] ?? true;
              return (
                <section
                  key={grade.id}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGrades((current) => ({
                        ...current,
                        [grade.id]: !gradeOpen,
                      }))
                    }
                    className="flex w-full items-center gap-2 px-4 py-3 text-right"
                  >
                    {gradeOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                    <span className="font-semibold">{grade.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({gradeSubjects.length} مادة)
                    </span>
                  </button>

                  {gradeOpen && (
                    <div className="space-y-2 border-t border-border p-3">
                      {gradeSubjects.map((subject) => {
                        const subjectTracks = maps.tracks.get(subject.id) ?? [];
                        const subjectUnits = maps.units.get(subject.id) ?? [];
                        const subjectLessons = maps.lessons.get(subject.id) ?? [];
                        const directLessons = subjectLessons.filter((lesson) => !lesson.unit_id);
                        const subjectOpen = expandedSubjects[subject.id] ?? false;
                        return (
                          <div
                            key={subject.id}
                            className="rounded-lg border border-border bg-background"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSubjects((current) => ({
                                  ...current,
                                  [subject.id]: !subjectOpen,
                                }))
                              }
                              className="flex w-full flex-wrap items-center gap-2 px-3 py-3 text-right"
                            >
                              {subjectOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronLeft className="h-4 w-4" />
                              )}
                              <BookOpen className="h-4 w-4 text-primary" />
                              <span className="font-medium text-foreground">{subject.name}</span>
                              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                                {subject.code ?? "بلا كود"}
                              </span>
                              <span className="flex flex-wrap gap-1">
                                {subjectTracks.length === 0 ? (
                                  <span className="text-xs text-destructive">بلا مسار</span>
                                ) : (
                                  subjectTracks.map((item) => (
                                    <span
                                      key={item.curriculum_track_id}
                                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                                    >
                                      {item.track?.track_name ?? "مسار"}
                                    </span>
                                  ))
                                )}
                              </span>
                              <span className="mr-auto text-xs text-muted-foreground">
                                {subjectUnits.length} وحدة · {subjectLessons.length} درس
                              </span>
                            </button>

                            {subjectOpen && (
                              <div className="space-y-3 border-t border-border p-3">
                                {subjectUnits.length === 0 ? (
                                  <div className="rounded-lg bg-muted/40 p-3">
                                    <p className="flex items-center gap-2 text-sm font-medium">
                                      <RouteIcon className="h-4 w-4 text-primary" />
                                      الدروس مرتبطة بالمادة مباشرة
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {directLessons.length} درس — لا توجد وحدات في هيكل هذه المادة.
                                    </p>
                                  </div>
                                ) : (
                                  subjectUnits.map((unit) => {
                                    const unitLessons = subjectLessons.filter(
                                      (lesson) => lesson.unit_id === unit.id,
                                    );
                                    return (
                                      <div key={unit.id} className="rounded-lg bg-muted/40 p-3">
                                        <p className="flex items-center gap-2 text-sm font-medium">
                                          <Layers className="h-4 w-4 text-primary" />
                                          {unit.title}
                                          <span className="font-mono text-[10px] text-muted-foreground">
                                            {unit.code}
                                          </span>
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {unitLessons.length} درس
                                        </p>
                                      </div>
                                    );
                                  })
                                )}
                                {subjectUnits.length > 0 && directLessons.length > 0 && (
                                  <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-900">
                                    {directLessons.length} درس إضافي مرتبط بالمادة مباشرة.
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2 text-xs">
                                  <a
                                    href="/admin/subjects"
                                    className="rounded border border-border px-2.5 py-1 hover:bg-muted"
                                  >
                                    إدارة المادة
                                  </a>
                                  <a
                                    href="/admin/units"
                                    className="rounded border border-border px-2.5 py-1 hover:bg-muted"
                                  >
                                    إدارة الوحدات
                                  </a>
                                  <a
                                    href="/admin/lessons/"
                                    className="rounded border border-border px-2.5 py-1 hover:bg-muted"
                                  >
                                    إدارة الدروس
                                  </a>
                                  <a
                                    href="/admin/textbooks"
                                    className="rounded border border-border px-2.5 py-1 hover:bg-muted"
                                  >
                                    إدارة الكتاب
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
