import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UnitEditDialog, type UnitEditValue } from "@/components/admin/UnitEditDialog";
import { Layers, Loader2, Search, ArrowRight, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/units")({
  component: AdminUnitsPage,
});

const PAGE_SIZE = 20;

type UnitRow = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_free: boolean;
  subject_id: string;
  subject?: { id: string; name: string | null; grade_id: string | null } | null;
};

function AdminUnitsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [freeFilter, setFreeFilter] = useState<string>("all");
  const [editing, setEditing] = useState<UnitEditValue | null>(null);

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
  }, [subjectFilter, gradeFilter, freeFilter]);

  const enabled = !loading && isAdmin;

  const subjectsQ = useQuery({
    enabled,
    queryKey: ["admin-units", "subjects-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, grade_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const gradesQ = useQuery({
    enabled,
    queryKey: ["admin-units", "grades-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Compute subject ids for grade filter to pass to the units query
  const gradeSubjectIds =
    gradeFilter !== "all"
      ? (subjectsQ.data?.filter((s) => s.grade_id === gradeFilter).map((s) => s.id) ?? [])
      : [];

  const unitsQ = useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: ["admin-units", page, debounced, subjectFilter, gradeFilter, freeFilter],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("units")
        .select(
          "id, title, description, sort_order, is_free, subject_id, subject:subjects!units_subject_id_fkey(id, name, grade_id)",
          { count: "exact" }
        )
        .order("sort_order", { ascending: true })
        .range(from, to);

      if (debounced) q = q.ilike("title", `%${debounced}%`);
      if (subjectFilter !== "all") q = q.eq("subject_id", subjectFilter);
      if (gradeFilter !== "all" && gradeSubjectIds.length > 0) {
        q = q.in("subject_id", gradeSubjectIds);
      }
      if (freeFilter !== "all") q = q.eq("is_free", freeFilter === "free");

      const { data, count, error } = await q;
      if (error) throw error;

      const rows = ((data ?? []) as unknown as any[]).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        sort_order: (r.sort_order as number) ?? 0,
        is_free: (r.is_free as boolean) ?? false,
        subject_id: r.subject_id as string,
        subject: r.subject as { id: string; name: string | null; grade_id: string | null } | null,
      }));

      return { rows, count: count ?? 0 };
    },
  });

  const unitIds = unitsQ.data?.rows.map((r) => r.id) ?? [];

  const lessonsCountQ = useQuery({
    enabled: enabled && unitIds.length > 0,
    queryKey: ["admin-units", "lessons-counts", unitIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("unit_id")
        .in("unit_id", unitIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.unit_id) map[row.unit_id] = (map[row.unit_id] || 0) + 1;
      }
      return map;
    },
  });

  const gradeNameMap: Record<string, string> = {};
  for (const g of gradesQ.data ?? []) {
    if (g.id && g.name) gradeNameMap[g.id] = g.name;
  }

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

  const total = unitsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = unitsQ.data?.rows ?? [];
  const lessonsMap = lessonsCountQ.data ?? {};

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              الوحدات الدراسية
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              قائمة الوحدات — قراءة فقط.
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
              placeholder="بحث بعنوان الوحدة…"
              className="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
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
            value={freeFilter}
            onChange={(e) => setFreeFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">كل الحالات</option>
            <option value="free">مجانية</option>
            <option value="sub">ضمن الاشتراك</option>
          </select>
        </div>

        {unitsQ.isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : unitsQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            تعذر تحميل الوحدات.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            لا توجد وحدات بعد.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                  <th className="px-4 py-3 text-right font-medium">الترتيب</th>
                    <th className="px-4 py-3 text-right font-medium">الوحدة</th>
                    <th className="px-4 py-3 text-right font-medium">المادة</th>
                    <th className="px-4 py-3 text-right font-medium">الصف</th>
                    <th className="px-4 py-3 text-right font-medium">الحالة</th>
                    <th className="px-4 py-3 text-right font-medium">الدروس</th>
                    <th className="px-4 py-3 text-right font-medium">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 text-muted-foreground">{r.sort_order}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{r.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.subject?.name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.is_free ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                            مجانية
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                            ضمن الاشتراك
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {lessonsCountQ.isLoading ? "…" : lessonsMap[r.id] ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              title: r.title,
                              description: r.description,
                              sort_order: r.sort_order,
                              is_free: r.is_free,
                              subject_id: r.subject_id,
                              subject_name: r.subject?.name ?? null,
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-foreground">{r.title}</div>
                    <span className="text-[11px] text-muted-foreground">#{r.sort_order}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                    <span>المادة: {r.subject?.name || "—"}</span>
                    <span>
                      الصف:{" "}
                      {r.subject?.grade_id ? gradeNameMap[r.subject.grade_id] || "—" : "—"}
                    </span>
                    <span>
                      الحالة:{" "}
                      {r.is_free ? (
                        <span className="text-emerald-600">مجانية</span>
                      ) : (
                        <span className="text-amber-600">ضمن الاشتراك</span>
                      )}
                    </span>
                    <span>
                      الدروس:{" "}
                      {lessonsCountQ.isLoading ? "…" : lessonsMap[r.id] ?? 0}
                    </span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          title: r.title,
                          description: r.description,
                          sort_order: r.sort_order,
                          is_free: r.is_free,
                          subject_id: r.subject_id,
                          subject_name: r.subject?.name ?? null,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      title="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </button>
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
                  disabled={page === 0 || unitsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  السابق
                </button>
                <button
                  onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                  disabled={page + 1 >= totalPages || unitsQ.isFetching}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  التالي
                </button>
              </div>
            </div>
          </>
        )}

        <UnitEditDialog
          open={editing !== null}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          unit={editing ?? undefined}
        />
      </div>
    </AdminLayout>
  );
}
