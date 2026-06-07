import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { HelpCircle, Loader2, Search, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/questions")({
  component: AdminQuestionsPage,
});

const PAGE_SIZE = 20;

type QuestionRow = {
  id: string;
  question_text: string;
  question_type: string | null;
  sort_order: number;
  options_count: number;
  lesson_id: string | null;
  subject_id: string | null;
  lesson?: { id: string; title: string | null; unit_id: string | null } | null;
  subject?: { id: string; name: string | null; grade_id: string | null } | null;
};

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function AdminQuestionsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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
  }, [gradeFilter, subjectFilter, lessonFilter, typeFilter]);

  const enabled = !loading && isAdmin;

  const gradesQ = useQuery({
    enabled,
    queryKey: ["admin-questions", "grades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjectsQ = useQuery({
    enabled,
    queryKey: ["admin-questions", "subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, grade_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const lessonsQ = useQuery({
    enabled,
    queryKey: ["admin-questions", "lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, subject_id, unit_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const typesQ = useQuery({
    enabled,
    queryKey: ["admin-questions", "types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("question_type")
        .limit(1000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of data ?? []) {
        const t = (r as any).question_type;
        if (t) set.add(t);
      }
      return Array.from(set).sort();
    },
  });

  const gradeSubjectIds =
    gradeFilter !== "all"
      ? (subjectsQ.data?.filter((s) => s.grade_id === gradeFilter).map((s) => s.id) ?? [])
      : [];

  const questionsQ = useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: [
      "admin-questions",
      page,
      debounced,
      gradeFilter,
      subjectFilter,
      lessonFilter,
      typeFilter,
    ],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // SECURITY: never select correct_index or explanation here.
      let q = supabase
        .from("questions")
        .select(
          "id, question_text, question_type, sort_order, options, lesson_id, subject_id, lesson:lessons!questions_lesson_id_fkey(id, title, unit_id), subject:subjects!questions_subject_id_fkey(id, name, grade_id)",
          { count: "exact" }
        )
        .order("sort_order", { ascending: true })
        .range(from, to);

      if (debounced) q = q.ilike("question_text", `%${debounced}%`);
      if (typeFilter !== "all") q = q.eq("question_type", typeFilter);
      if (lessonFilter !== "all") q = q.eq("lesson_id", lessonFilter);
      if (subjectFilter !== "all") q = q.eq("subject_id", subjectFilter);
      if (gradeFilter !== "all" && gradeSubjectIds.length > 0) {
        q = q.in("subject_id", gradeSubjectIds);
      }

      const { data, count, error } = await q;
      if (error) throw error;

      const rows: QuestionRow[] = ((data ?? []) as any[]).map((r) => {
        const opts = r.options;
        let optsCount = 0;
        if (Array.isArray(opts)) optsCount = opts.length;
        else if (opts && typeof opts === "object") optsCount = Object.keys(opts).length;
        return {
          id: r.id,
          question_text: r.question_text ?? "",
          question_type: r.question_type ?? null,
          sort_order: r.sort_order ?? 0,
          options_count: optsCount,
          lesson_id: r.lesson_id ?? null,
          subject_id: r.subject_id ?? null,
          lesson: r.lesson ?? null,
          subject: r.subject ?? null,
        };
      });
      return { rows, count: count ?? 0 };
    },
  });

  const gradeNameMap: Record<string, string> = {};
  for (const g of gradesQ.data ?? []) {
    if (g.id && g.name) gradeNameMap[g.id] = g.name;
  }

  const subjectOptions =
    gradeFilter !== "all"
      ? subjectsQ.data?.filter((s) => s.grade_id === gradeFilter) ?? []
      : subjectsQ.data ?? [];

  const lessonOptions =
    subjectFilter !== "all"
      ? lessonsQ.data?.filter((l) => l.subject_id === subjectFilter) ?? []
      : gradeFilter !== "all"
      ? lessonsQ.data?.filter((l) => gradeSubjectIds.includes(l.subject_id)) ?? []
      : lessonsQ.data ?? [];

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

  const total = questionsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = questionsQ.data?.rows ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-primary" />
              الأسئلة
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              قائمة الأسئلة — قراءة فقط. لا يتم عرض الإجابات الصحيحة.
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
              placeholder="بحث في نص السؤال…"
              className="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={gradeFilter}
            onChange={(e) => {
              setGradeFilter(e.target.value);
              setSubjectFilter("all");
              setLessonFilter("all");
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
              setLessonFilter("all");
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل المواد</option>
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={lessonFilter}
            onChange={(e) => setLessonFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الدروس</option>
            {lessonOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الأنواع</option>
            {typesQ.data?.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {questionsQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : questionsQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            تعذر تحميل الأسئلة.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            لا توجد أسئلة.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium">#</th>
                    <th className="px-3 py-3 text-right font-medium">السؤال</th>
                    <th className="px-3 py-3 text-right font-medium">النوع</th>
                    <th className="px-3 py-3 text-right font-medium">الدرس</th>
                    <th className="px-3 py-3 text-right font-medium">المادة</th>
                    <th className="px-3 py-3 text-right font-medium">الصف</th>
                    <th className="px-3 py-3 text-center font-medium">عدد الخيارات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-3 text-muted-foreground">{r.sort_order}</td>
                      <td className="px-3 py-3 text-foreground max-w-md">
                        {truncate(r.question_text, 120)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.question_type || "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.lesson?.title || "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.subject?.name || "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground">
                        {r.options_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground">{truncate(r.question_text, 120)}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      #{r.sort_order}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                    <span>النوع: {r.question_type || "—"}</span>
                    <span>الخيارات: {r.options_count}</span>
                    <span>الدرس: {r.lesson?.title || "—"}</span>
                    <span>المادة: {r.subject?.name || "—"}</span>
                    <span>
                      الصف:{" "}
                      {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground">
                صفحة {page + 1} من {totalPages} — إجمالي {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || questionsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  السابق
                </button>
                <button
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages || questionsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
