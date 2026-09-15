import { createFileRoute } from "@tanstack/react-router";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ContentCompletionReport } from "@/components/admin/ContentCompletionReport";
export const Route = createFileRoute("/_authenticated/admin/academic")({ component: Page });
function Page() {
  const { loading, enabled } = useRequireAdminSection("content");
  return (
    <AdminLayout>
      {loading ? (
        <p>جارٍ التحقق من الصلاحيات…</p>
      ) : enabled ? (
        <ContentCompletionReport enabled={enabled} />
      ) : (
        <p>ليست لديك صلاحية الوصول.</p>
      )}
    </AdminLayout>
  );
}
