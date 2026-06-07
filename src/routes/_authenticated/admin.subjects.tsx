import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { BookOpen, Loader2, Search, ArrowRight, Pencil } from "lucide-react";
import {
  SubjectEditDialog,
  type SubjectEditValue,
} from "@/components/admin/SubjectEditDialog";

export const Route = createFileRoute("/_authenticated/admin/subjects")({
  component: AdminSubjectsPage,
});

const PAGE_SIZE = 20;

type SubjectRow = {
  id: string;
  name: string;
  sort_order: number;
  lessons_count: number | null;
  grade_id: string;
  curriculum_track_id: string | null;
  icon: string | null;
  color: string | null;
  grade?: { id: string; name: string | null } | null;
  track?: { id: string; track_name: string | null } | null;
};

function AdminSubjectsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [editing, setEditing] = useState<SubjectEditValue | null>(null);

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
  }, [gradeFilter]);

  const enabled = !loading && isAdmin;

  const gradesQ = useQuery({
    enabled,
    queryKey: ["admin-subjects", "grades"],
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
    placeholderData: keepPreviousData,
    queryKey: ["admin-subjects", page, debounced, gradeFilter],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("subjects")
        .select(
          "id, name, sort_order, lessons_count, grade_id, curriculum_track_id, grade:grades!subjects_grade_id_fkey(id, name), track:curriculum_tracks!subjects_curriculum_track_id_fkey(id, track_name)",
          { count: "exact" }
        )
        .order("sort_order", { ascending: true })
        .range(from, to);
      if (debounced) q = q.ilike("name", `%${debounced}%`);
      if (gradeFilter !== "all") q = q.eq("grade_id", gradeFilter);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data as unknown as SubjectRow[]) ?? [], count: count ?? 0 };
    },
  });

  const subjectIds = subjectsQ.data?.rows.map((r) => r.id) ?? [];

  const unitsCountQ = useQuery({
    enabled: enabled && subjectIds.length > 0,
    queryKey: ["admin-subjects", "units-counts", subjectIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("subject_id")
        .in("subject_id", subjectIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.subject_id) map[row.subject_id] = (map[row.subject_id] || 0) + 1;
      }
      return map;
    },
  });

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

  const total = subjectsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = subjectsQ.data?.rows ?? [];
  const unitsMap = unitsCountQ.data ?? {};

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              المواد الدراسية
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              قائمة المواد — قراءة فقط.
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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم المادة…"
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
        </div>

        {subjectsQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : subjectsQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            تعذر تحميل المواد.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            لا توجد مواد بعد.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">الترتيب</th>
                    <th className="px-4 py-3 text-right font-medium">المادة</th>
                    <th className="px-4 py-3 text-right font-medium">الصف</th>
                    <th className="px-4 py-3 text-right font-medium">المسار</th>
                    <th className="px-4 py-3 text-right font-medium">الوحدات</th>
                    <th className="px-4 py-3 text-right font-medium">الدروس</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">{r.sort_order}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.grade?.name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.track?.track_name || "عام"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {unitsCountQ.isLoading ? "…" : unitsMap[r.id] ?? 0}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.lessons_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <span className="text-[11px] text-muted-foreground">#{r.sort_order}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                    <span>الصف: {r.grade?.name || "—"}</span>
                    <span>المسار: {r.track?.track_name || "عام"}</span>
                    <span>الوحدات: {unitsCountQ.isLoading ? "…" : unitsMap[r.id] ?? 0}</span>
                    <span>الدروس: {r.lessons_count ?? 0}</span>
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
                  disabled={page === 0 || subjectsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  السابق
                </button>
                <button
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages || subjectsQ.isFetching}
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
