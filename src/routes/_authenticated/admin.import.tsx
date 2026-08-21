import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { GoldenLessonCf11OperatorPanel } from "@/components/admin/GoldenLessonCf11OperatorPanel";
import { GoldenLessonPackageBuilder } from "@/components/admin/GoldenLessonPackageBuilder";
import { Button } from "@/components/ui/button";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { contentImportTemplateDownloadUrl } from "@/lib/content-import/content-import-templates";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

const QUESTION_TEMPLATES = [
  {
    number: 6,
    title: "أسئلة الكتاب الأصلية",
    filename: "09_official_book_questions_template.xlsx",
    description: "تعريفات، تعليلات، أسئلة قصيرة، شرح، واختيار واحد بالنص الأصلي للكتاب.",
  },
  {
    number: 7,
    title: "اختبر فهمك",
    filename: "10_self_test_questions_template.xlsx",
    description: "اختيار من متعدد مع الإجابة الصحيحة والشرح وتصويب الخيارات الخاطئة.",
  },
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
      <main className="mx-auto max-w-6xl space-y-6" dir="rtl">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">مركز استيراد محتوى الدرس</h1>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            المسار المعتمد يتكون من سبعة محتويات مرتبة. ستة إلزامية، والتجربة أو النشاط
            التفاعلي وحده اختياري. لا يوجد ZIP للدرس ولا PDF مستقل له ولا ملف توثيق مصدر.
          </p>
        </header>

        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <BookOpen className="h-5 w-5 text-primary" /> كتاب المادة الرسمي
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                يرفع PDF مرة واحدة فقط بحسب الصف والمادة والمسار ونطاق الفصل الدراسي.
              </p>
            </div>
            <Button asChild variant="outline">
              <a href="/admin/textbooks">إدارة كتب المواد</a>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="قوالب الأسئلة المعتمدة">
          {QUESTION_TEMPLATES.map((template) => (
            <article key={template.filename} className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold">{template.number}. {template.title}</h2>
              <p className="mt-1 min-h-10 text-xs text-muted-foreground">{template.description}</p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <a href={contentImportTemplateDownloadUrl(template.filename)} download>
                  <Download className="ms-1 h-4 w-4" /> تنزيل قالب XLSX المعتمد
                </a>
              </Button>
            </article>
          ))}
        </section>

        <GoldenLessonPackageBuilder />

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" /> مراجعة المسودات واعتمادها
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              الاستيراد ينشئ مسودة فقط. لا يظهر أي محتوى للطالب قبل المراجعة والاعتماد.
            </p>
          </div>
          <GoldenLessonCf11OperatorPanel />
        </section>
      </main>
    </AdminLayout>
  );
}
