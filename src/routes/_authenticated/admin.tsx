import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Users,
  BookOpen,
  GraduationCap,
  MessageSquare,
  Shield,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, isAdmin, navigate]);

  const enabled = !loading && isAdmin;

  const studentsQ = useQuery({
    enabled,
    queryKey: ["admin-count", "profiles"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const subjectsQ = useQuery({
    enabled,
    queryKey: ["admin-count", "subjects"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("subjects")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const lessonsQ = useQuery({
    enabled,
    queryKey: ["admin-count", "lessons"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lessons")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const contactsQ = useQuery({
    enabled,
    queryKey: ["admin-count", "contact_submissions"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contact_submissions")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const anyLoading =
    studentsQ.isLoading || subjectsQ.isLoading || lessonsQ.isLoading || contactsQ.isLoading;
  const anyError =
    studentsQ.isError || subjectsQ.isError || lessonsQ.isError || contactsQ.isError;

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

  return (
    <AdminLayout>
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            لوحة الإدارة
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مرحبًا بك في لوحة إدارة تنوير.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      {anyError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
          تعذر تحميل الإحصائيات.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="الطلاب"
            value={studentsQ.data}
            loading={studentsQ.isLoading}
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
            icon={<GraduationCap className="h-5 w-5" />}
            label="الدروس"
            value={lessonsQ.data}
            loading={lessonsQ.isLoading}
            color="bg-amber-50 text-amber-600"
            iconBg="bg-amber-100"
          />
          <StatCard
            icon={<MessageSquare className="h-5 w-5" />}
            label="رسائل التواصل"
            value={contactsQ.data}
            loading={contactsQ.isLoading}
            color="bg-rose-50 text-rose-600"
            iconBg="bg-rose-100"
          />
        </div>
      )}

      {/* Coming soon placeholder cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/admin/students"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">الطلاب</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              قائمة الطلاب المسجلين (قراءة فقط)
            </p>
          </div>
        </Link>
        <AdminCard
          icon={<BookOpen className="h-5 w-5" />}
          title="المحتوى الدراسي"
          description="إدارة المواد والوحدات والدروس"
        />
        <AdminCard
          icon={<Shield className="h-5 w-5" />}
          title="الاشتراكات"
          description="خطط الاشتراك والمدفوعات"
        />
        <AdminCard
          icon={<MessageSquare className="h-5 w-5" />}
          title="رسائل التواصل"
          description="التواصل مع الطلاب وأولياء الأمور"
        />
      </div>

      {/* Empty state hint */}
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          سيتم إضافة المزيد من أدوات الإدارة قريبًا.
        </p>
      </div>
    </div>
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

function AdminCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 opacity-60 cursor-not-allowed select-none">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="mt-auto inline-block self-start rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        قريبًا
      </span>
    </div>
  );
}
