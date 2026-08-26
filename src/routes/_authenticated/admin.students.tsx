import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  component: AdminStudentsPage,
});

const PAGE_SIZE = 20;

type Row = {
  id: string;
  full_name: string | null;
  school_name: string | null;
  governorate: string | null;
  created_at: string;
  grade?: { name: string | null } | null;
  governorate_ref?: { name: string | null } | null;
};

function AdminStudentsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

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
    queryKey: ["admin-students", page, debounced],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("profiles")
        .select(
          "id, full_name, school_name, governorate, created_at, grade:grades!profiles_grade_uuid_fkey(name), governorate_ref:governorates!profiles_governorate_id_fkey(name)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (debounced) q = q.ilike("full_name", `%${debounced}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data as unknown as Row[]) ?? [], count: count ?? 0 };
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

        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم…"
            className="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-3 text-sm outline-none focus:border-primary"
          />
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
            لا يوجد طلاب بعد.
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
                      <td className="px-4 py-3 text-muted-foreground">{r.grade?.name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.governorate_ref?.name || r.governorate || "—"}
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
                    <span>الصف: {r.grade?.name || "—"}</span>
                    <span>المحافظة: {r.governorate_ref?.name || r.governorate || "—"}</span>
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
