import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { SubjectTextbooksManager } from "@/components/admin/SubjectTextbooksManager";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/textbooks")({
  component: AdminTextbooksPage,
});

function AdminTextbooksPage() {
  useRequireAdminSection("content");

  return (
    <AdminLayout>
      <div className="space-y-4" dir="rtl">
        <header>
          <h1 className="text-lg font-bold text-foreground">رفع كتب المواد</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر الصف والمسار والمادة والفصل، ثم ارفع ملف كتاب المادة الرسمي PDF مرة واحدة للنطاق المحدد.
          </p>
        </header>
        <SubjectTextbooksManager />
      </div>
    </AdminLayout>
  );
}
