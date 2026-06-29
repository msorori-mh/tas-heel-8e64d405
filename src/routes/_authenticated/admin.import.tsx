import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
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
  IMPORT_NOT_ENABLED_YET,
  IMPORT_ORDER_GROUPS,
  IMPORT_TEMPLATE_CATALOG,
  importTemplateDownloadUrl,
} from "@/lib/import-template-catalog";
import {
  Download,
  FileSpreadsheet,
  Info,
  ListOrdered,
  Lock,
} from "lucide-react";
import { ImportDryRunGovernorates } from "@/components/admin/ImportDryRunGovernorates";
import { ImportJobsHistory } from "@/components/admin/ImportJobsHistory";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

function AdminImportPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جاري التحميل…
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">مركز الاستيراد</h1>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground max-w-3xl">
            إدارة قوالب الاستيراد وتجهيز البيانات قبل التفعيل المرحلي للمعاينة والتنفيذ.
          </p>
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
                <li>• القوالب متاحة للتحميل حالياً.</li>
                <li>• تجربة المعاينة الجافة متاحة لقالب المحافظات فقط (قراءة محلية).</li>
                <li>• التنفيذ في قاعدة البيانات غير مفعّل في هذه المرحلة.</li>
                <li>• لا يتم تعديل أي بيانات من هذه الصفحة.</li>
              </ul>
            </div>
          </div>
        </div>

        <ImportDryRunGovernorates />

        <ImportJobsHistory />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">قوالب الاستيراد</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {IMPORT_TEMPLATE_CATALOG.map((template) => (
              <Card key={template.file} className="flex flex-col overflow-hidden">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      المرحلة {String(template.order).padStart(2, "0")}
                    </Badge>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {template.dataType}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base leading-snug">{template.nameAr}</CardTitle>
                    {template.sensitive && (
                      <Badge
                        variant="destructive"
                        className="gap-1 text-[11px]"
                        aria-label="قالب حساس"
                      >
                        <Lock className="h-3 w-3" />
                        حساس
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{template.descriptionAr}</CardDescription>
                  <p
                    className="truncate font-mono text-[11px] text-muted-foreground/80"
                    title={template.file}
                  >
                    {template.file}
                  </p>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>ترتيب الاستيراد: {template.order}</span>
                    <span className="text-border">|</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      متاح للتحميل
                    </span>
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
                      href={importTemplateDownloadUrl(template.file)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      تحميل القالب
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/55 bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary shrink-0" />
            <h2 className="text-lg font-semibold text-foreground">ترتيب الاستيراد الموصى به</h2>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {IMPORT_ORDER_GROUPS.map((group) => (
              <li
                key={group.range}
                className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-foreground">{group.range}</span>
                <span className="text-muted-foreground"> — {group.label}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-border/55 bg-card p-5 shadow-card space-y-4">
          <h2 className="text-lg font-semibold text-foreground">ما الذي لم يتم تفعيله بعد؟</h2>
          <p className="text-sm text-muted-foreground">
            الميزات التالية قيد التطوير وستُفعَّل في مراحل لاحقة — لا يمكن استخدامها الآن.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {IMPORT_NOT_ENABLED_YET.map((item) => (
              <li key={item}>
                <Button
                  variant="outline"
                  disabled
                  className="w-full min-h-[44px] justify-between gap-2 opacity-70"
                  aria-disabled
                >
                  <span>{item}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">قريباً</Badge>
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground/90 border-t border-border/40 pt-4">
          سجل عمليات الاستيراد أعلاه للقراءة فقط في هذه المرحلة. بلوحة تحكم الإدارة الشاملة ضمن
          ADMIN-CONTROL-CENTER-01 ستُربط لاحقاً بعد اكتمال نظام الاستيراد.
        </p>
      </div>
    </AdminLayout>
  );
}
