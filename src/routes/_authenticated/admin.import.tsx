import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { GoldenLessonPackageBuilder } from "@/components/admin/GoldenLessonPackageBuilder";
import { useRequireAdminSection } from "@/lib/admin-route-access";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

const STEPS = [
  { number: 1, label: "اختيار الدرس" },
  { number: 2, label: "رفع المحتويات السبعة" },
  { number: 3, label: "فحص وحفظ المسودة" },
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
            اختر الدرس مرة واحدة، ثم ارفع محتوياته السبعة مباشرة واحفظها كمسودة.
            ستة محتويات إلزامية، والتجربة أو النشاط التفاعلي وحده اختياري.
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

        <GoldenLessonPackageBuilder />
      </main>
    </AdminLayout>
  );
}
