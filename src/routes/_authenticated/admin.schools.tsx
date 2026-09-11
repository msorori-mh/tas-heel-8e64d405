import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SchoolDirectory } from "@/components/admin/SchoolDirectory";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/schools")({
  component: AdminSchoolsPage,
});

function AdminSchoolsPage() {
  const { enabled, loading } = useRequireAdminSection("full");
  return (
    <AdminLayout>
      {loading ? <p>جارٍ التحقق من الصلاحيات…</p> : enabled ? <SchoolDirectory /> : null}
    </AdminLayout>
  );
}
