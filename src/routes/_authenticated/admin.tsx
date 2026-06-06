import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Users,
  BookOpen,
  CreditCard,
  MessageSquare,
  ArrowLeft,
  Shield,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        جارٍ التحقق من الصلاحيات…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        ليست لديك صلاحية الوصول لهذه الصفحة.
      </div>
    );
  }

  return (
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
        <Link
          to="/app"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          العودة للتطبيق
        </Link>
      </div>

      {/* Placeholder cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard
          icon={<Users className="h-5 w-5" />}
          title="الطلاب"
          description="إدارة حسابات الطلاب والمتابعة"
        />
        <AdminCard
          icon={<BookOpen className="h-5 w-5" />}
          title="المحتوى الدراسي"
          description="إدارة المواد والوحدات والدروس"
        />
        <AdminCard
          icon={<CreditCard className="h-5 w-5" />}
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
