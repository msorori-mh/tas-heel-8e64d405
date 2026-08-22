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
          <h1 className="text-lg font-bold text-foreground">كتب المنهج</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            ارفع كتاب المادة الرسمي PDF لأول مرة أو استبدله لاحقًا، وحدد هل يشمل صنعاء وعدن معًا أو مسارًا واحدًا، والفصلين أو فصلًا محددًا.
          </p>
        </header>
        <SubjectTextbooksManager />
      </div>
    </AdminLayout>
  );
}
