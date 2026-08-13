import { createFileRoute } from "@tanstack/react-router";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER,
  CONTENT_IMPORT_WORKFLOW_ORDER,
  contentImportTemplateDownloadUrl,
} from "@/lib/content-import/content-import-templates";
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  Info,
  ListOrdered,
  Lock,
} from "lucide-react";
import { ImportJobsHistory } from "@/components/admin/ImportJobsHistory";
import { ContentImportDryRunPanel } from "@/components/admin/ContentImportDryRunPanel";
import { InteractiveHtmlImportPanel } from "@/components/admin/InteractiveHtmlImportPanel";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

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

  if (!enabled) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">مركز الاستيراد</h1>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-3xl">
            المسار الرسمي لإدخال المنهج: حمّل القالب، جهّز الملف، افحصه، ثم نفّذه بالترتيب أدناه.
          </p>
          <nav
            aria-label="ترتيب خطوات الاستيراد"
            className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/5 p-3"
          >
            {CONTENT_IMPORT_WORKFLOW_STEPS.map((step, index) => (
              <span key={`${step.label}-${index}`} className="flex items-center gap-1.5">
                <Badge
                  variant={step.gate ? "outline" : "secondary"}
                  className="text-[11px] font-medium"
                >
                  {step.label}
                </Badge>
                {index < CONTENT_IMPORT_WORKFLOW_STEPS.length - 1 && (
                  <span className="text-muted-foreground text-xs">←</span>
                )}
              </span>
            ))}
          </nav>
        </header>


        <div
          role="alert"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm"
        >
          <div className="flex gap-3">
            <Info className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
            <div className="min-w-0 space-y-2">
              <p className="font-medium text-foreground">تنبيه — المرحلة الحالية</p>
              <ul className="space-y-1 text-muted-foreground list-none ps-0">
                <li>• القوالب متاحة للتحميل.</li>
                <li>• مسار المحتوى يعمل بثلاث خطوات: فحص ← تجهيز ← تنفيذ.</li>
                <li>• التنفيذ يتم داخل معاملة واحدة لكل قالب — ينجح كاملاً أو يتراجع كاملاً.</li>
                <li>• المحتوى الجديد يبقى مسودة قيد المراجعة ولا يظهر للطالب قبل الاعتماد.</li>
                <li>• قالب الأسئلة (09) يمر حصراً عبر مسار بنك الأسئلة.</li>
              </ul>

            </div>
          </div>
        </div>

        <section
          id="lesson-content-import"
          className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5"
          aria-labelledby="lesson-content-import-heading"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary shrink-0" />
              <h2 id="lesson-content-import-heading" className="text-lg font-semibold text-foreground">
                استيراد محتوى الدروس
              </h2>
              <Badge variant="secondary" className="text-[11px]">قوالب 01–09</Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-3xl">
              هذه القوالب هي المسار الرسمي لإدخال محتوى الدروس. لكل قالب: فحص الملف ← تجهيز ←
              تنفيذ داخل معاملة واحدة.
            </p>

          </div>

          <ContentImportDryRunPanel />

          <InteractiveHtmlImportPanel />

          <div
            role="note"
            className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-sm"
          >
            <p className="font-medium text-foreground">حماية النشر</p>
            <p className="mt-1 text-muted-foreground text-xs">
              الصفوف المنشورة لا يُكتب فوقها من الاستيراد، وتظهر ضمن «محجوب (منشور)» في نتيجة التنفيذ.
            </p>
          </div>


          <div className="border-2 border-dashed border-primary/30 rounded-xl p-4 bg-primary/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-primary shrink-0" />
                  ترتيب العمل الموصى به
                </p>
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {CONTENT_IMPORT_WORKFLOW_ORDER}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  عرّف lesson_code في نموذج 03 قبل الموارد والأسئلة. أعد بنك الأسئلة (09) قبل ربط
                  التقييمات (07–08).
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER.map((template) => (
              <Card key={template.filename} className="flex flex-col overflow-hidden border-primary/15">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      {String(template.order).padStart(2, "0")}
                    </Badge>
                    {template.editorOnly && (
                      <Badge variant="outline" className="gap-1 text-[11px] shrink-0">
                        <Lock className="h-3 w-3" />
                        للمحررين
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base leading-snug">{template.titleAr}</CardTitle>
                  <CardDescription>{template.descriptionAr}</CardDescription>
                  <p
                    className="truncate font-mono text-[11px] text-muted-foreground/80"
                    title={template.filename}
                  >
                    {template.filename}
                  </p>
                </CardHeader>
                <CardContent className="pb-3 pt-0 space-y-2">
                  <p className="text-[11px] text-muted-foreground">أعمدة أساسية:</p>
                  <div className="flex flex-wrap gap-1">
                    {template.requiredBaseColumns.map((col) => (
                      <Badge key={col} variant="outline" className="text-[10px] font-mono">
                        {col}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button
                    asChild
                    variant="default"
                    size="sm"
                    className="w-full min-h-[44px] gap-2"
                  >
                    <a
                      href={contentImportTemplateDownloadUrl(template.filename)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      تنزيل القالب
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        

        <ImportJobsHistory />




        <p className="text-xs leading-relaxed text-muted-foreground/90 border-t border-border/40 pt-4">
          الترتيب الرسمي لتنفيذ القوالب: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 09 → 08. لا تنفّذ قالباً
          قبل نجاح ما يسبقه، وكل تنفيذ يمرّ إلزامياً بمعاينة (Dry-Run) قبل الاعتماد.
        </p>
      </div>
    </AdminLayout>
  );
}
