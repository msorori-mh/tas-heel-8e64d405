import { createFileRoute, Link } from "@tanstack/react-router";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  BookOpen,
  GraduationCap,
  Layers,
  FolderOpen,
  Loader2,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/academic")({
  component: AdminAcademicPage,
});

function AdminAcademicPage() {
  const { loading, enabled } = useRequireAdminSection("content");

  const gradesQ = useQuery({
    enabled,
    queryKey: ["admin-academic", "grades-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("grades")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const subjectsQ = useQuery({
    enabled,
    queryKey: ["admin-academic", "subjects-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("subjects")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const unitsQ = useQuery({
    enabled,
    queryKey: ["admin-academic", "units-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("units")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const lessonsQ = useQuery({
    enabled,
    queryKey: ["admin-academic", "lessons-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lessons")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const gradesListQ = useQuery({
    enabled,
    queryKey: ["admin-academic", "grades-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjectsByGradeQ = useQuery({
    enabled,
    queryKey: ["admin-academic", "subjects-by-grade"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("grade_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.grade_id) {
          map[row.grade_id] = (map[row.grade_id] || 0) + 1;
        }
      }
      return map;
    },
  });

  const anyLoading =
    gradesQ.isLoading ||
    subjectsQ.isLoading ||
    unitsQ.isLoading ||
    lessonsQ.isLoading ||
    gradesListQ.isLoading ||
    subjectsByGradeQ.isLoading;

  const anyError =
    gradesQ.isError ||
    subjectsQ.isError ||
    unitsQ.isError ||
    lessonsQ.isError ||
    gradesListQ.isError ||
    subjectsByGradeQ.isError;

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

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              المحتوى الدراسي
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              نظرة عامة على المحتوى الأكاديمي — قراءة فقط.
            </p>
          </div>
          <Link
            to="/admin/subjects"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            عرض المواد
          </Link>
          <Link
            to="/admin/units"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            عرض الوحدات
          </Link>
        </div>

        {/* Stats cards */}
        {anyError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive flex items-center justify-center gap-2">
            <AlertCircle className="h-4 w-4" />
            تعذر تحميل الإحصائيات.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<GraduationCap className="h-5 w-5" />}
              label="الصفوف"
              value={gradesQ.data}
              loading={gradesQ.isLoading}
              color="bg-blue-50 text-blue-600"
              iconBg="bg-blue-100"
            />
            <StatCard
              icon={<BookOpen className="h-5 w-5" />}
              label="المواد"
              value={subjectsQ.data}
              loading={subjectsQ.isLoading}
              color="bg-emerald-50 text-emerald-600"
              iconBg="bg-emerald-100"
            />
            <StatCard
              icon={<Layers className="h-5 w-5" />}
              label="الوحدات"
              value={unitsQ.data}
              loading={unitsQ.isLoading}
              color="bg-amber-50 text-amber-600"
              iconBg="bg-amber-100"
            />
            <StatCard
              icon={<FolderOpen className="h-5 w-5" />}
              label="الدروس"
              value={lessonsQ.data}
              loading={lessonsQ.isLoading}
              color="bg-rose-50 text-rose-600"
              iconBg="bg-rose-100"
            />
          </div>
        )}

        {/* Grades overview */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            ملخص حسب الصف
          </h2>

          {gradesListQ.isLoading || subjectsByGradeQ.isLoading ? (
            <div className="flex min-h-[20vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : gradesListQ.isError || subjectsByGradeQ.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
              تعذر تحميل ملخص الصفوف.
            </div>
          ) : gradesListQ.data?.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
              لا توجد صفوف مسجلة.
            </div>
          ) : (
            <div className="space-y-3">
              {gradesListQ.data?.map((grade) => {
                const subjectCount = subjectsByGradeQ.data?.[grade.id] ?? 0;
                return (
                  <div
                    key={grade.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {grade.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-left">
                        <span className="text-xs text-muted-foreground">المواد</span>
                        <p className="text-lg font-bold text-foreground">
                          {subjectCount}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  color,
  iconBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
  color: string;
  iconBg: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-card ${color}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-2xl font-bold text-foreground">
            {value === undefined || value === null ? "--" : value}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
