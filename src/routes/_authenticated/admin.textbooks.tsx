import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { SubjectTextbooksManager } from "@/components/admin/SubjectTextbooksManager";
import { useAdminRouteGuard } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/textbooks")({
  component: AdminTextbooksPage,
});

function AdminTextbooksPage() {
  useAdminRouteGuard("/admin/textbooks");

  return (
    <AdminLayout>
      <div className="space-y-4" dir="rtl">
        <header>
          <h1 className="text-lg font-bold text-foreground">كتب المنهج</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            كتب المادة حسب المسار والفصل الدراسي. يراها الطالب داخل «موادي» ويحمّلها اختيارياً.
          </p>
        </header>
        <SubjectTextbooksManager />
      </div>
    </AdminLayout>
  );
}
