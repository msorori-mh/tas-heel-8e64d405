import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Pencil, Plus, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SubjectEditDialog, type SubjectEditValue } from "@/components/admin/SubjectEditDialog";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/subjects")({
  component: AdminSubjectsPage,
  head: () => ({
    meta: [
      { title: "المواد والمسارات | لوحة تمكين" },
      {
        name: "description",
        content: "إنشاء المادة وربطها بالصف وبمنهج صنعاء أو عدن أو كليهما.",
      },
    ],
  }),
});

type Grade = { id: string; name: string; sort_order: number };
type Track = { id: string; track_name: string; track_code: string };
type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  group_code: string | null;
  group_name: string | null;
  sort_order: number;
  grade_id: string;
  icon: string | null;
  color: string | null;
  grade?: { id: string; name: string | null } | null;
};
type Assignment = {
  subject_id: string;
  curriculum_track_id: string;
  is_active: boolean;
  track?: Track | null;
};

function TrackBadges({ assignments }: { assignments: Assignment[] }) {
  if (assignments.length === 0) {
    return <span className="text-xs text-destructive">بلا مسار فعّال</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {assignments.map((item) => (
        <span
          key={item.curriculum_track_id}
          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          {item.track?.track_name ?? "مسار"}
        </span>
      ))}
    </div>
  );
}

function AdminSubjectsPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SubjectEditValue | null>(null);

  const dataQ = useQuery({
    enabled,
    queryKey: ["admin-subjects", "truth"],
    queryFn: async () => {
      const [grades, tracks, subjects, assignments, units, lessons] = await Promise.all([
        supabase.from("grades").select("id, name, sort_order").order("sort_order"),
        supabase
          .from("curriculum_tracks")
          .select("id, track_name, track_code")
          .in("track_code", ["sanaa", "aden"])
          .eq("is_active", true)
          .order("track_name"),
        supabase
          .from("subjects")
          .select(
            "id, name, code, group_code, group_name, sort_order, grade_id, icon, color, grade:grades!subjects_grade_id_fkey(id, name)",
          )
          .order("sort_order"),
        supabase
          .from("subject_curriculum_tracks")
          .select(
            "subject_id, curriculum_track_id, is_active, track:curriculum_tracks!subject_curriculum_tracks_curriculum_track_id_fkey(id, track_name, track_code)",
          )
          .eq("is_active", true),
        supabase.from("units").select("subject_id"),
        supabase.from("lessons").select("subject_id"),
      ]);
      for (const result of [grades, tracks, subjects, assignments, units, lessons]) {
        if (result.error) throw result.error;
      }
      return {
        grades: (grades.data ?? []) as Grade[],
        tracks: (tracks.data ?? []) as Track[],
        subjects: (subjects.data ?? []) as unknown as SubjectRow[],
        assignments: (assignments.data ?? []) as unknown as Assignment[],
        unitSubjectIds: (units.data ?? []).map((row) => row.subject_id).filter(Boolean) as string[],
        lessonSubjectIds: (lessons.data ?? [])
          .map((row) => row.subject_id)
          .filter(Boolean) as string[],
      };
    },
  });

  const assignmentsBySubject = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const assignment of dataQ.data?.assignments ?? []) {
      const current = map.get(assignment.subject_id) ?? [];
      current.push(assignment);
      map.set(assignment.subject_id, current);
    }
    return map;
  }, [dataQ.data?.assignments]);

  const counts = useMemo(() => {
    const units = new Map<string, number>();
    const lessons = new Map<string, number>();
    for (const id of dataQ.data?.unitSubjectIds ?? []) units.set(id, (units.get(id) ?? 0) + 1);
    for (const id of dataQ.data?.lessonSubjectIds ?? [])
      lessons.set(id, (lessons.get(id) ?? 0) + 1);
    return { units, lessons };
  }, [dataQ.data?.unitSubjectIds, dataQ.data?.lessonSubjectIds]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    return (dataQ.data?.subjects ?? []).filter((subject) => {
      if (gradeFilter !== "all" && subject.grade_id !== gradeFilter) return false;
      const subjectAssignments = assignmentsBySubject.get(subject.id) ?? [];
      if (
        trackFilter !== "all" &&
        !subjectAssignments.some((item) => item.curriculum_track_id === trackFilter)
      ) {
        return false;
      }
      if (!term) return true;
      return (
        subject.name.toLocaleLowerCase("ar").includes(term) ||
        (subject.code ?? "").toLowerCase().includes(term)
      );
    });
  }, [assignmentsBySubject, dataQ.data?.subjects, gradeFilter, search, trackFilter]);

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
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <BookOpen className="h-6 w-6 text-primary" />
              المواد والمسارات
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              المادة تُنشأ مرة واحدة للصف، ثم تُربط بمنهج صنعاء أو عدن أو كليهما.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            إضافة مادة
          </button>
        </header>

        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم المادة أو الكود…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-3 pr-9 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الصفوف</option>
            {dataQ.data?.grades.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </select>
          <select
            value={trackFilter}
            onChange={(event) => setTrackFilter(event.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل المسارات</option>
            {dataQ.data?.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.track_name}
              </option>
            ))}
          </select>
        </div>

        {dataQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dataQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
            تعذر تحميل المواد وعلاقات المسارات.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            لا توجد مواد مطابقة.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">المادة</th>
                  <th className="px-4 py-3 text-right font-medium">الصف</th>
                  <th className="px-4 py-3 text-right font-medium">المسارات</th>
                  <th className="px-4 py-3 text-center font-medium">الوحدات</th>
                  <th className="px-4 py-3 text-center font-medium">الدروس</th>
                  <th className="px-4 py-3 text-right font-medium">الإدارة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((subject) => {
                  const subjectAssignments = assignmentsBySubject.get(subject.id) ?? [];
                  return (
                    <tr key={subject.id} className="border-t border-border align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{subject.name}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {subject.code ?? "بلا كود TCS-2"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {subject.grade?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <TrackBadges assignments={subjectAssignments} />
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {counts.units.get(subject.id) ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {counts.lessons.get(subject.id) ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              setEditing({
                                id: subject.id,
                                name: subject.name,
                                code: subject.code,
                                group_code: subject.group_code,
                                group_name: subject.group_name,
                                sort_order: subject.sort_order,
                                icon: subject.icon,
                                color: subject.color,
                                grade_id: subject.grade_id,
                                track_ids: subjectAssignments.map(
                                  (item) => item.curriculum_track_id,
                                ),
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            تعديل
                          </button>
                          <a
                            href="/admin/units"
                            className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            الوحدات
                          </a>
                          <a
                            href="/admin/lessons/"
                            className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            الدروس
                          </a>
                          <a
                            href="/admin/textbooks"
                            className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            الكتاب
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SubjectEditDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        grades={dataQ.data?.grades ?? []}
        tracks={dataQ.data?.tracks ?? []}
      />
      <SubjectEditDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        mode="edit"
        subject={editing}
        grades={dataQ.data?.grades ?? []}
        tracks={dataQ.data?.tracks ?? []}
      />
    </AdminLayout>
  );
}
