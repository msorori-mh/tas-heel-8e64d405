import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  BookOpen,
  Loader2,
  Search,
  ArrowRight,
  Check,
  Minus,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  computeLessonCapabilities,
  computeLessonReadiness,
  LESSON_READINESS_REASON_AR,
  type LessonCapabilityType,
  type LessonReadiness,
} from "@/lib/lessons/lesson-capabilities";

import { LessonBasicEditDialog } from "@/components/admin/LessonBasicEditDialog";
import { LessonCreateDialog } from "@/components/admin/LessonCreateDialog";
import { CurriculumDeleteDialog } from "@/components/admin/CurriculumDeleteDialog";
import { CurriculumPrelaunchPurgeControl } from "@/components/admin/CurriculumPrelaunchPurgeControl";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/lessons/")({
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

/** Capability chips shown per lesson row, in student-journey order. */
const ROW_CAPABILITIES: { type: LessonCapabilityType; label: string }[] = [
  { type: "PRIMARY_CONTENT", label: "محتوى" },
  { type: "SUMMARY", label: "ملخص" },
  { type: "OFFICIAL_QUESTIONS", label: "أسئلة الكتاب" },
  { type: "SELF_TEST", label: "اختبر فهمك" },
  { type: "EXTRA_RESOURCES", label: "موارد" },
  { type: "VIDEO", label: "فيديو" },
  { type: "PRACTICAL", label: "عملي" },
];

function Indicator({ on }: { on: boolean }) {
  return on ? (
    <Check className="inline h-4 w-4 text-emerald-600" />
  ) : (
    <Minus className="inline h-4 w-4 text-muted-foreground/50" />
  );
}

/** STUDENT_READY signal — the operator's single answer to "هل يراه الطالب؟". */
function ReadinessBadge({ readiness }: { readiness: LessonReadiness | undefined }) {
  if (!readiness) {
    return <span className="text-[11px] text-muted-foreground">…</span>;
  }
  const hasWarnings = readiness.warnings.length > 0;
  if (readiness.studentReady) {
    return (
      <span
        title={hasWarnings ? LESSON_READINESS_REASON_AR[readiness.warnings[0]] : "جاهز للطالب"}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          hasWarnings
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {hasWarnings ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
        {hasWarnings ? "جاهز مع تنبيه" : "جاهز للطالب"}
      </span>
    );
  }
  return (
    <span
      title={LESSON_READINESS_REASON_AR[readiness.reason]}
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
    >
      <AlertTriangle className="h-3 w-3" />
      {LESSON_READINESS_REASON_AR[readiness.reason]}
    </span>
  );
}

function AdminLessonsPage() {
  return <AdminLessonsList />;
}

function AdminLessonsList() {
  const { loading, enabled } = useRequireAdminSection("content");
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
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState<{
    id: string;
    title: string;
    subject_name: string | null;
    unit_name: string | null;
  } | null>(null);

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

  useEffect(() => {
    if (subjectFilter === "all" || gradeFilter === "all") return;
    const selected = subjectsQ.data?.find((subject) => subject.id === subjectFilter);
    if (selected && selected.grade_id !== gradeFilter) {
      setSubjectFilter("all");
      setUnitFilter("all");
    }
  }, [gradeFilter, subjectFilter, subjectsQ.data]);

  const lessonsQ = useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: ["admin-lessons", page, debounced, subjectFilter, unitFilter, gradeFilter],
    queryFn: async () => {
      if (gradeFilter !== "all" && gradeSubjectIds.length === 0) {
        return { rows: [] as LessonRow[], count: 0 };
      }
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("lessons")
        .select(
          "id, title, sort_order, duration, is_free, unit_id, subject_id, unit:units!lessons_unit_id_fkey(id, title), subject:subjects!lessons_subject_id_fkey(id, name, grade_id)",
          { count: "exact" },
        )
        .order("sort_order", { ascending: true })
        .range(from, to);

      if (debounced) q = q.ilike("title", `%${debounced}%`);
      if (subjectFilter !== "all") q = q.eq("subject_id", subjectFilter);
      if (unitFilter === "__NO_UNIT__") q = q.is("unit_id", null);
      else if (unitFilter !== "all") q = q.eq("unit_id", unitFilter);
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

  /**
   * LESSON_DYNAMIC_CAPABILITY_AND_STUDENT_UX_FIX_18B
   * Admin readiness uses the SAME capability engine as the student page, so an
   * operator sees exactly what the student would get (admins bypass the
   * enhancement gate, hence `enhancementsAccessible: true`).
   */
  const indicatorsQ = useQuery({
    enabled: enabled && lessonIds.length > 0,
    queryKey: ["admin-lessons", "readiness", lessonIds],
    queryFn: async () => {
      const [lessonsRes, bookRes, summaryRes, questionsRes, resourcesRes, simsRes, explRes] =
        await Promise.all([
          supabase
            .from("lessons")
            .select("id, delivery_mode, content_text, has_video")
            .in("id", lessonIds),
          supabase
            .from("lesson_book_contents")
            .select("lesson_id, content")
            .in("lesson_id", lessonIds),
          supabase.from("lesson_summaries").select("lesson_id, summary").in("lesson_id", lessonIds),
          supabase.from("questions").select("lesson_id").in("lesson_id", lessonIds),
          supabase
            .from("lesson_resources")
            .select("id, lesson_id, resource_type, html_resource_type, title, url, is_primary")
            .in("lesson_id", lessonIds),
          supabase.from("lesson_simulations").select("lesson_id").in("lesson_id", lessonIds),
          supabase
            .from("lesson_explanations")
            .select("lesson_id, content")
            .in("lesson_id", lessonIds),
        ]);

      const firstError =
        lessonsRes.error ??
        bookRes.error ??
        summaryRes.error ??
        questionsRes.error ??
        resourcesRes.error ??
        simsRes.error ??
        explRes.error;
      if (firstError) throw firstError;

      const byLesson = <T extends { lesson_id?: string | null }>(rows: T[] | null) => {
        const map: Record<string, T[]> = {};
        for (const row of rows ?? []) {
          const lid = row.lesson_id;
          if (!lid) continue;
          (map[lid] ??= []).push(row);
        }
        return map;
      };

      const books = byLesson(bookRes.data as any[]);
      const summaries = byLesson(summaryRes.data as any[]);
      const questions = byLesson(questionsRes.data as any[]);
      const resources = byLesson(resourcesRes.data as any[]);
      const sims = byLesson(simsRes.data as any[]);
      const explanations = byLesson(explRes.data as any[]);
      const lessonMeta: Record<string, any> = {};
      for (const row of (lessonsRes.data ?? []) as any[]) lessonMeta[row.id] = row;

      const map: Record<string, LessonReadiness> = {};
      for (const id of lessonIds) {
        const meta = lessonMeta[id] ?? {};
        const rows = resources[id] ?? [];
        const html = (t: string) => rows.filter((r: any) => r.html_resource_type === t).length;
        const plain = rows
          .filter((r: any) => !r.html_resource_type)
          .map((r: any) => ({
            id: r.id as string,
            resource_type: (r.resource_type as string | null) ?? null,
            title: (r.title as string | null) ?? null,
            url: (r.url as string) ?? "",
          }));
        const primary = rows.find((r: any) => r.is_primary === true);

        const capabilities = computeLessonCapabilities({
          deliveryMode: meta.delivery_mode ?? null,
          bookContent: (books[id] ?? [])[0]?.content ?? null,
          inlineContent: meta.content_text ?? null,
          primaryResource: primary
            ? {
                id: primary.id as string,
                resource_type: (primary.resource_type as string | null) ?? null,
                title: (primary.title as string | null) ?? null,
                url: (primary.url as string) ?? "",
              }
            : null,
          resources: plain,
          simulationsCount: (sims[id] ?? []).length,
          htmlMindMapsCount: html("mind_map_html"),
          htmlExperimentsCount: html("practical_experiment_html"),
          htmlSummariesCount: html("summary_html"),
          summaryText: (summaries[id] ?? [])[0]?.summary ?? null,
          explanationsCount: (explanations[id] ?? []).filter(
            (e: any) => ((e.content as string | null) ?? "").trim().length > 0,
          ).length,
          questionsCount: (questions[id] ?? []).length,
          lessonExamCount: 0,
          hasLessonVideoFlag: meta.has_video === true,
          enhancementsAccessible: true,
        });

        map[id] = computeLessonReadiness(capabilities);
      }
      return map;
    },
  });

  const gradeNameMap: Record<string, string> = {};
  for (const g of gradesQ.data ?? []) {
    if (g.id && g.name) gradeNameMap[g.id] = g.name;
  }

  const subjectOptions =
    gradeFilter === "all"
      ? (subjectsQ.data ?? [])
      : (subjectsQ.data ?? []).filter((subject) => subject.grade_id === gradeFilter);

  // Unit options follow the selected subject or grade; direct lessons remain explicit.
  const unitOptions =
    subjectFilter !== "all"
      ? (unitsQ.data?.filter((u) => u.subject_id === subjectFilter) ?? [])
      : gradeFilter !== "all"
        ? (unitsQ.data?.filter((unit) => gradeSubjectIds.includes(unit.subject_id)) ?? [])
        : (unitsQ.data ?? []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          جارٍ التحقق من الصلاحيات…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) {
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
            <p className="mt-1 text-sm text-muted-foreground">قائمة الدروس — قراءة فقط.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CurriculumPrelaunchPurgeControl />
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              إضافة درس
            </button>
            <Link
              to="/admin/academic"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" />
              المحتوى الدراسي
            </Link>
          </div>
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
            onChange={(e) => {
              setGradeFilter(e.target.value);
              setSubjectFilter("all");
              setUnitFilter("all");
            }}
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
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}{gradeFilter === "all" && subject.grade_id ? ` — ${gradeNameMap[subject.grade_id] ?? ""}` : ""}
              </option>
            ))}
          </select>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الوحدات</option>
            <option value="__NO_UNIT__">دروس مرتبطة بالمادة مباشرة (بلا وحدة)</option>
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
                    <th className="px-3 py-3 text-right font-medium">الجاهزية</th>
                    {ROW_CAPABILITIES.map((c) => (
                      <th
                        key={c.type}
                        className="px-3 py-3 text-center font-medium"
                        title={c.label}
                      >
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const readiness = ind[r.id];
                    const available = new Set(readiness?.availableCapabilities ?? []);
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-3 text-muted-foreground">{r.sort_order}</td>
                        <td className="px-3 py-3 text-foreground font-medium">
                          <Link
                            to="/admin/lesson-content/$lessonId"
                            params={{ lessonId: r.id }}
                            className="hover:text-primary hover:underline"
                          >
                            {r.title}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{r.unit?.title || "—"}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {r.subject?.name || "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{r.duration || "—"}</td>
                        <td className="px-3 py-3">
                          <ReadinessBadge readiness={readiness} />
                        </td>
                        {ROW_CAPABILITIES.map((c) => (
                          <td key={c.type} className="px-3 py-3 text-center">
                            <Indicator on={available.has(c.type)} />
                          </td>
                        ))}

                        <td className="px-3 py-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                              <Link
                                to="/admin/lesson-content/$lessonId"
                                params={{ lessonId: r.id }}
                                title="إدارة محتوى الدرس"
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                                إدارة المحتوى
                              </Link>
                            </Button>
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
                                  is_free: r.is_free,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                              title="تعديل"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              تعديل
                            </button>
                            <button
                              onClick={() =>
                                setDeletingLesson({
                                  id: r.id,
                                  title: r.title,
                                  subject_name: r.subject?.name || null,
                                  unit_name: r.unit?.title || null,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-card px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              حذف
                            </button>
                          </div>
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
                const readiness = ind[r.id];
                const available = new Set(readiness?.availableCapabilities ?? []);
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to="/admin/lesson-content/$lessonId"
                        params={{ lessonId: r.id }}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {r.title}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">#{r.sort_order}</span>
                    </div>
                    <div className="mt-2">
                      <ReadinessBadge readiness={readiness} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                      <span>الوحدة: {r.unit?.title || "—"}</span>
                      <span>المادة: {r.subject?.name || "—"}</span>
                      <span>
                        الصف: {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                      </span>
                      <span>المدة: {r.duration || "—"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {ROW_CAPABILITIES.map((c) => (
                        <span key={c.type}>
                          {c.label} <Indicator on={available.has(c.type)} />
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button asChild size="sm" variant="outline" className="gap-1 text-xs">
                        <Link
                          to="/admin/lesson-content/$lessonId"
                          params={{ lessonId: r.id }}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          إدارة المحتوى
                        </Link>
                      </Button>
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
                            is_free: r.is_free,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </button>
                      <button
                        onClick={() =>
                          setDeletingLesson({
                            id: r.id,
                            title: r.title,
                            subject_name: r.subject?.name || null,
                            unit_name: r.unit?.title || null,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-card px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
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

        <LessonCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

        <CurriculumDeleteDialog
          open={!!deletingLesson}
          onOpenChange={(o) => {
            if (!o) setDeletingLesson(null);
          }}
          target={
            deletingLesson
              ? { type: "lesson", id: deletingLesson.id, label: deletingLesson.title }
              : null
          }
        />
      </div>
    </AdminLayout>
  );
}

