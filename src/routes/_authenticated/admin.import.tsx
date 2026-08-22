import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, FileCheck2, FileSpreadsheet, UploadCloud } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { GoldenLessonPackageBuilder } from "@/components/admin/GoldenLessonPackageBuilder";
import { Button } from "@/components/ui/button";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

const STEPS = [
  { number: 1, label: "اختيار الدرس" },
  { number: 2, label: "رفع المحتويات" },
  { number: 3, label: "الفحص والحفظ كمسودة" },
] as const;

function AdminImportPage() {
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

  return (
    <AdminLayout>
      <main className="mx-auto max-w-5xl space-y-6 pb-24" dir="rtl">
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">استيراد محتويات درس</h1>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            اختر الدرس، ارفع محتوياته السبعة، ثم افحصها واحفظها كمسودة. ستة محتويات
            إلزامية، والتجربة أو النشاط التفاعلي وحده اختياري.
          </p>
          <ol aria-label="خطوات استيراد الدرس" className="grid gap-2 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.number} className="flex min-h-[52px] items-center gap-3 rounded-xl border bg-card px-4 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </li>
            ))}
          </ol>
        </header>

        <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-semibold">كتاب المادة الرسمي</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  يرفع مرة واحدة فقط على مستوى المادة والفصل الدراسي، ولا يرفع PDF مستقل للدرس.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <a href="/admin/textbooks">إدارة كتب المواد</a>
            </Button>
          </div>
        </section>

        <GoldenLessonPackageBuilder />

        <section aria-label="الواجهات الإدارية المنفصلة" className="rounded-xl border bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-2">
              <h2 className="font-semibold">بعد حفظ المسودة</h2>
              <p className="text-xs text-muted-foreground">
                المراجعة والاعتماد والنشر عمليات منفصلة بصلاحيات مستقلة، ولا تظهر أدواتها داخل رحلة الرفع.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href="/admin/content-review">فتح مراجعة المحتوى</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href="/admin/content-review?view=release">
                    <UploadCloud className="h-4 w-4" />عمليات النشر
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </AdminLayout>
  );
}
