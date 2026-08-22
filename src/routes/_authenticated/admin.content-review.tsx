import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { GoldenLessonCf11OperatorPanel } from "@/components/admin/GoldenLessonCf11OperatorPanel";
import { GoldenLessonManifestReviewPanel } from "@/components/admin/GoldenLessonManifestReviewPanel";
import { Button } from "@/components/ui/button";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/content-review")({
  component: AdminContentReviewPage,
});

function AdminContentReviewPage() {
  const { loading, enabled } = useRequireAdminSection("content");

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جاري التحميل…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) return null;

  const releaseView = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "release";

  if (releaseView) {
    return (
      <AdminLayout>
        <main className="mx-auto max-w-6xl space-y-6 pb-20" dir="rtl">
          <header className="space-y-2">
            <h1 className="text-2xl font-bold">عمليات نشر المحتوى</h1>
            <p className="text-sm text-muted-foreground">
              واجهة مستقلة لمسؤول النشر. لا يمكن نشر محتوى لم يكتمل اعتماده.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="/admin/content-review">العودة إلى مراجعة المحتوى</a>
            </Button>
          </header>
          <GoldenLessonCf11OperatorPanel />
        </main>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <main className="mx-auto max-w-6xl space-y-6 pb-20" dir="rtl">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">مراجعة محتوى الدروس</h1>
          <p className="text-sm text-muted-foreground">
            راجع مسودة الدرس واعتمدها أو أعدها للتعديل. لا توجد هنا طوابير موارد قديمة أو خطوات رفع إضافية.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href="/admin/import">العودة إلى استيراد درس</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="/admin/content-review?view=release">فتح عمليات النشر</a>
            </Button>
          </div>
        </header>

        <GoldenLessonManifestReviewPanel />
      </main>
    </AdminLayout>
  );
}
