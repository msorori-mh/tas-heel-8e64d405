import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, Loader2, Search, FilterX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: AdminStudentsPage,
});

const PAGE_SIZE = 20;

type Row = {
  id: string;
  full_name: string | null;
  school_name: string | null;
  governorate_name: string | null;
  grade_name: string | null;
  created_at: string;
};

type FilterOption = { id: string; name: string; count: number };
type SchoolOption = { name: string; count: number };
type FilterOptions = {
  total: number;
  incomplete: number;
  grades: FilterOption[];
  governorates: FilterOption[];
  schools: SchoolOption[];
};

type StudentResult = { rows: Row[]; count: number };

function AdminStudentsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [governorateId, setGovernorateId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: ["admin-students", page, debounced, governorateId, gradeId, schoolName],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_students_filtered", {
        p_page: page,
        p_page_size: PAGE_SIZE,
        p_search: debounced || undefined,
        p_governorate_id: governorateId || undefined,
        p_grade_id: gradeId || undefined,
        p_school_name: schoolName || undefined,
      });
      if (error) throw error;
      return data as unknown as StudentResult;
    },
  });

  const optionsQuery = useQuery({
    enabled,
    queryKey: ["admin-student-filter-options"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_student_filter_options");
      if (error) throw error;
      return data as unknown as FilterOptions;
    },
  });

  const resetFilters = () => {
    setSearch("");
    setDebounced("");
    setGovernorateId("");
    setGradeId("");
    setSchoolName("");
    setPage(0);
  };

  const hasFilters = Boolean(debounced || governorateId || gradeId || schoolName);

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

  const total = query.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = query.data?.rows ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              الطلاب
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">قائمة الطلاب المسجلين — قراءة فقط.</p>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>اسم الطالب</span>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم…"
                className="w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>المحافظة</span>
            <select
              value={governorateId}
              onChange={(e) => {
                setGovernorateId(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">جميع المحافظات</option>
              {(optionsQuery.data?.governorates ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>الصف</span>
            <select
              value={gradeId}
              onChange={(e) => {
                setGradeId(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">جميع الصفوف</option>
              {(optionsQuery.data?.grades ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>المدرسة</span>
            <select
              value={schoolName}
              onChange={(e) => {
                setSchoolName(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">جميع المدارس</option>
              {(optionsQuery.data?.schools ?? []).map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name} ({option.count})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div>
            <div className="text-sm text-muted-foreground">عدد الطلاب المطابقين</div>
            <div className="text-2xl font-bold text-foreground">
              {query.isLoading ? "—" : total.toLocaleString("ar-EG")}
            </div>
            {!hasFilters && optionsQuery.data && (
              <div className="text-xs text-muted-foreground">
                من أصل {optionsQuery.data.total.toLocaleString("ar-EG")} طالب مسجل
                {optionsQuery.data.incomplete > 0 &&
                  ` · ${optionsQuery.data.incomplete.toLocaleString("ar-EG")} ببيانات دراسية غير مكتملة`}
              </div>
            )}
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <FilterX className="h-4 w-4" />
              مسح الفلاتر
            </button>
          )}
        </div>

        {query.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            تعذر تحميل الطلاب.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            {hasFilters ? "لا يوجد طلاب مطابقون للفلاتر المحددة." : "لا يوجد طلاب بعد."}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">الاسم</th>
                    <th className="px-4 py-3 text-right font-medium">الصف</th>
                    <th className="px-4 py-3 text-right font-medium">المحافظة</th>
                    <th className="px-4 py-3 text-right font-medium">المدرسة</th>
                    <th className="px-4 py-3 text-right font-medium">تاريخ التسجيل</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 text-foreground">{r.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.grade_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.governorate_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.school_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="font-medium text-foreground">{r.full_name || "—"}</div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                    <span>الصف: {r.grade_name || "—"}</span>
                    <span>المحافظة: {r.governorate_name || "—"}</span>
                    <span className="col-span-2">المدرسة: {r.school_name || "—"}</span>
                    <span className="col-span-2">
                      التسجيل: {new Date(r.created_at).toLocaleDateString("ar-EG")}
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
                  disabled={page === 0 || query.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  السابق
                </button>
                <button
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages || query.isFetching}
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
