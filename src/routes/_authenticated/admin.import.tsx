import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { ContentImportDryRunPanel } from "@/components/admin/ContentImportDryRunPanel";
import { CurriculumImportScopeForm } from "@/components/admin/CurriculumImportScopeForm";
import { GoldenLessonPackageBuilder } from "@/components/admin/GoldenLessonPackageBuilder";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import type { CurriculumImportScope } from "@/lib/import/curriculum-import-scope";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

const STEPS = [
  { number: 1, label: "الوحدات أو الفصول — اختياري" },
  { number: 2, label: "الدروس" },
  { number: 3, label: "المحتويات السبعة" },
  { number: 4, label: "الفحص والنشر" },
] as const;

function AdminImportPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const [structureScope, setStructureScope] = useState<CurriculumImportScope | null>(null);

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
      <main className="mx-auto max-w-5xl space-y-8 pb-24" dir="rtl">
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">الاستيراد والفحص والنشر</h2>
          </div>
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            بعد تعريف المادة وكتابها من التبويبات أعلاه، ثبّت سياق الصف والمسار والفصل
            والمادة هنا، ثم ارفع الوحدات إن وجدت، فالدروس، فمحتويات الدرس. إذا كانت
            المادة بلا وحدات فاترك <span className="font-mono">unit_code</span> فارغًا.
          </p>
          <ol aria-label="خطوات الاستيراد الموحد" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.number} className="flex min-h-[58px] items-center gap-3 rounded-xl border bg-card px-4 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </li>
            ))}
          </ol>
        </header>

        <CurriculumImportScopeForm value={structureScope} onChange={setStructureScope} />

        <section className="space-y-3" aria-labelledby="units-import-heading">
          <div>
            <h2 id="units-import-heading" className="text-lg font-bold">
              1. استيراد الوحدات أو الفصول
              <span className="mr-2 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                اختياري
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              استخدم هذه الخطوة فقط للمواد المقسمة إلى وحدات أو فصول. المواد الأخرى
              تنتقل مباشرة إلى استيراد الدروس.
            </p>
          </div>
          <ContentImportDryRunPanel
            allowedTemplateKeys={["units"]}
            initialTemplateKey="units"
            heading="استيراد ملف الوحدات"
            description="ارفع ملف Excel الخاص بالوحدات، ثم نفّذ: فحص ← تجهيز ← تنفيذ."
            idPrefix="units-import"
            curriculumScope={structureScope}
          />
        </section>

        <section className="space-y-3" aria-labelledby="lessons-import-heading">
          <div>
            <h2 id="lessons-import-heading" className="text-lg font-bold">
              2. استيراد الدروس
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              يقبل الدروس المرتبطة بوحدة، كما يقبل الدروس المرتبطة بالمادة مباشرة.
              يبدأ ترتيب الدرس من 1.
            </p>
          </div>
          <ContentImportDryRunPanel
            allowedTemplateKeys={["lessons"]}
            initialTemplateKey="lessons"
            heading="استيراد ملف الدروس"
            description="ارفع ملف Excel الخاص بالدروس. اترك unit_code فارغًا للمادة التي لا تحتوي وحدات."
            idPrefix="lessons-import"
            curriculumScope={structureScope}
          />
        </section>

        <section className="space-y-3" aria-labelledby="contents-import-heading">
          <div>
            <h2 id="contents-import-heading" className="text-lg font-bold">
              3. استيراد محتويات الدروس السبعة
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر الدرس وارفع مكوناته في نموذج واحد: ستة مكونات HTML، و«اختبر فهمك» فقط بصيغة Excel.
              بعد نجاح الفحص يتم النشر مباشرة بضغطة واحدة دون خطوة مسودة.
            </p>
          </div>
          <GoldenLessonPackageBuilder />
        </section>
      </main>
    </AdminLayout>
  );
}
