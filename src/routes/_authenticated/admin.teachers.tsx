import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminTeacherDirectory } from "@/components/admin/AdminTeacherDirectory";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/teachers")({
  component: AdminTeachersPage,
});
function AdminTeachersPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  return (
    <AdminLayout>
      {loading ? <p>جارٍ التحقق من الصلاحيات…</p> : enabled ? <AdminTeacherDirectory /> : null}
    </AdminLayout>
  );
}
