import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { BookOpen, Loader2, Search, ArrowRight, Check, Minus, Pencil } from "lucide-react";
import { LessonBasicEditDialog } from "@/components/admin/LessonBasicEditDialog";

export const Route = createFileRoute("/_authenticated/admin/lessons")({
  component: AdminLessonsPage,
});

const PAGE_SIZE = 20;

type LessonRow = {
  id: string;
  title: string;
  sort_order: number;
  duration: string | null;
  unit_id: string | null;
  subject_id: string;
  is_free: boolean | null;
  unit?: { id: string; title: string | null } | null;
  subject?: { id: string; name: string | null; grade_id: string | null } | null;
};

function Indicator({ on }: { on: boolean }) {
  return on ? (
    <Check className="inline h-4 w-4 text-emerald-600" />
  ) : (
    <Minus className="inline h-4 w-4 text-muted-foreground/50" />
  );
}

function AdminLessonsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [editingLesson, setEditingLesson] = useState<{
    id: string;
    title: string;
    sort_order: number;
    duration: string | null;
    subject_id: string;
    subject_name: string | null;
    unit_id: string | null;
    unit_name: string | null;
    is_free: boolean | null;
  } | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app", replace: true });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [subjectFilter, unitFilter, gradeFilter]);

  const enabled = !loading && isAdmin;

  const subjectsQ = useQuery({
    enabled,
    queryKey: ["admin-lessons", "subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, grade_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unitsQ = useQuery({
    enabled,
    queryKey: ["admin-lessons", "units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, title, subject_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const gradesQ = useQuery({
    enabled,
    queryKey: ["admin-lessons", "grades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const gradeSubjectIds =
    gradeFilter !== "all"
      ? (subjectsQ.data?.filter((s) => s.grade_id === gradeFilter).map((s) => s.id) ?? [])
      : [];

  const lessonsQ = useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: ["admin-lessons", page, debounced, subjectFilter, unitFilter, gradeFilter],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("lessons")
        .select(
          "id, title, sort_order, duration, is_free, unit_id, subject_id, unit:units!lessons_unit_id_fkey(id, title), subject:subjects!lessons_subject_id_fkey(id, name, grade_id)",
          { count: "exact" }
        )
        .order("sort_order", { ascending: true })
        .range(from, to);

      if (debounced) q = q.ilike("title", `%${debounced}%`);
      if (subjectFilter !== "all") q = q.eq("subject_id", subjectFilter);
      if (unitFilter !== "all") q = q.eq("unit_id", unitFilter);
      if (gradeFilter !== "all" && gradeSubjectIds.length > 0) {
        q = q.in("subject_id", gradeSubjectIds);
      }

      const { data, count, error } = await q;
      if (error) throw error;

      const rows = ((data ?? []) as unknown as any[]).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        sort_order: (r.sort_order as number) ?? 0,
        duration: (r.duration as string | null) ?? null,
        is_free: (r.is_free as boolean | null) ?? null,
        unit_id: (r.unit_id as string | null) ?? null,
        subject_id: r.subject_id as string,
        unit: r.unit ?? null,
        subject: r.subject ?? null,
      })) as LessonRow[];

      return { rows, count: count ?? 0 };
    },
  });

  const lessonIds = lessonsQ.data?.rows.map((r) => r.id) ?? [];

  const indicatorsQ = useQuery({
    enabled: enabled && lessonIds.length > 0,
    queryKey: ["admin-lessons", "indicators", lessonIds],
    queryFn: async () => {
      const tables = [
        "lesson_book_contents",
        "lesson_summaries",
        "questions",
        "lesson_resources",
        "lesson_simulations",
      ] as const;
      const tableResults = await Promise.all(
        tables.map((t) =>
          supabase.from(t).select("lesson_id").in("lesson_id", lessonIds)
        )
      );
      // Existence flag for video (do not read the URL value).
      const videoRes = await supabase
        .from("lessons")
        .select("id")
        .in("id", lessonIds)
        .not("video_url", "is", null);

      const map: Record<string, Record<string, boolean>> = {};
      for (const id of lessonIds) {
        map[id] = {
          book: false,
          summary: false,
          questions: false,
          resources: false,
          simulations: false,
          video: false,
        };
      }
      const keys = ["book", "summary", "questions", "resources", "simulations"];
      tableResults.forEach((res, i) => {
        for (const row of res.data ?? []) {
          const lid = (row as any).lesson_id;
          if (lid && map[lid]) map[lid][keys[i]] = true;
        }
      });
      for (const row of videoRes.data ?? []) {
        const lid = (row as any).id;
        if (lid && map[lid]) map[lid].video = true;
      }
      return map;
    },
  });

  const gradeNameMap: Record<string, string> = {};
  for (const g of gradesQ.data ?? []) {
    if (g.id && g.name) gradeNameMap[g.id] = g.name;
  }

  // Filter unit options based on subject filter
  const unitOptions =
    subjectFilter !== "all"
      ? unitsQ.data?.filter((u) => u.subject_id === subjectFilter) ?? []
      : unitsQ.data ?? [];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          جارٍ التحقق من الصلاحيات…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          ليست لديك صلاحية الوصول لهذه الصفحة.
        </div>
      </AdminLayout>
    );
  }

  const total = lessonsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = lessonsQ.data?.rows ?? [];
  const ind = indicatorsQ.data ?? {};

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              الدروس
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              قائمة الدروس — قراءة فقط.
            </p>
          </div>
          <Link
            to="/admin/academic"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" />
            المحتوى الدراسي
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بعنوان الدرس…"
              className="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الصفوف</option>
            {gradesQ.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setUnitFilter("all");
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل المواد</option>
            {subjectsQ.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الوحدات</option>
            {unitOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title}
              </option>
            ))}
          </select>
        </div>

        {lessonsQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : lessonsQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            تعذر تحميل الدروس.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            لا توجد دروس بعد.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium">#</th>
                    <th className="px-3 py-3 text-right font-medium">الدرس</th>
                    <th className="px-3 py-3 text-right font-medium">الوحدة</th>
                    <th className="px-3 py-3 text-right font-medium">المادة</th>
                    <th className="px-3 py-3 text-right font-medium">الصف</th>
                    <th className="px-3 py-3 text-right font-medium">المدة</th>
                    <th className="px-3 py-3 text-center font-medium" title="كتاب">كتاب</th>
                    <th className="px-3 py-3 text-center font-medium" title="ملخص">ملخص</th>
                    <th className="px-3 py-3 text-center font-medium" title="أسئلة">أسئلة</th>
                    <th className="px-3 py-3 text-center font-medium" title="موارد">موارد</th>
                    <th className="px-3 py-3 text-center font-medium" title="فيديو">فيديو</th>
                    <th className="px-3 py-3 text-center font-medium" title="محاكاة">محاكاة</th>
                    <th className="px-3 py-3 text-center font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const flags = ind[r.id] ?? {};
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-3 text-muted-foreground">{r.sort_order}</td>
                        <td className="px-3 py-3 text-foreground font-medium">
                          <Link
                            to="/admin/lessons/$lessonId"
                            params={{ lessonId: r.id }}
                            className="hover:text-primary hover:underline"
                          >
                            {r.title}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{r.unit?.title || "—"}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.subject?.name || "—"}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{r.duration || "—"}</td>
                        <td className="px-3 py-3 text-center"><Indicator on={!!flags.book} /></td>
                        <td className="px-3 py-3 text-center"><Indicator on={!!flags.summary} /></td>
                        <td className="px-3 py-3 text-center"><Indicator on={!!flags.questions} /></td>
                        <td className="px-3 py-3 text-center"><Indicator on={!!flags.resources} /></td>
                        <td className="px-3 py-3 text-center"><Indicator on={!!flags.video} /></td>
                        <td className="px-3 py-3 text-center"><Indicator on={!!flags.simulations} /></td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() =>
                              setEditingLesson({
                                id: r.id,
                                title: r.title,
                                sort_order: r.sort_order,
                                duration: r.duration,
                                subject_id: r.subject_id,
                                subject_name: r.subject?.name || null,
                                unit_id: r.unit_id,
                                unit_name: r.unit?.title || null,
                                is_free: null, // will be refined when schema supports per-lesson is_free
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            title="تعديل"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            تعديل
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {rows.map((r) => {
                const flags = ind[r.id] ?? {};
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to="/admin/lessons/$lessonId"
                        params={{ lessonId: r.id }}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {r.title}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">#{r.sort_order}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                      <span>الوحدة: {r.unit?.title || "—"}</span>
                      <span>المادة: {r.subject?.name || "—"}</span>
                      <span>
                        الصف:{" "}
                        {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                      </span>
                      <span>المدة: {r.duration || "—"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>كتاب <Indicator on={!!flags.book} /></span>
                      <span>ملخص <Indicator on={!!flags.summary} /></span>
                      <span>أسئلة <Indicator on={!!flags.questions} /></span>
                      <span>موارد <Indicator on={!!flags.resources} /></span>
                      <span>فيديو <Indicator on={!!flags.video} /></span>
                      <span>محاكاة <Indicator on={!!flags.simulations} /></span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() =>
                          setEditingLesson({
                            id: r.id,
                            title: r.title,
                            sort_order: r.sort_order,
                            duration: r.duration,
                            subject_id: r.subject_id,
                            subject_name: r.subject?.name || null,
                            unit_id: r.unit_id,
                            unit_name: r.unit?.title || null,
                            is_free: null,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground">
                صفحة {page + 1} من {totalPages} — إجمالي {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || lessonsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  السابق
                </button>
                <button
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages || lessonsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        )}

        <LessonBasicEditDialog
          open={!!editingLesson}
          onOpenChange={(o) => {
            if (!o) setEditingLesson(null);
          }}
          lesson={editingLesson ?? undefined}
        />
      </div>
    </AdminLayout>
  );
}
