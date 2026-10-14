import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

function AdminNotFound() {
  return (
    <div dir="rtl" className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          لا توجد صفحة إدارة بهذا العنوان. اختر القسم من القائمة.
        </p>
        <Link
          to="/admin"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          لوحة الإدارة
        </Link>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin")({
  component: () => <Outlet />,
  // /admin/learning-insights (no index) and mistyped admin paths previously
  // fell through to TanStack's default English "Not Found".
  notFoundComponent: AdminNotFound,
});
