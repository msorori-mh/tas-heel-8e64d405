import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ExamTemplateEditDialog,
  type ExamTemplateValue,
} from "@/components/admin/ExamTemplateEditDialog";
import { ExamTemplateQuestionsDialog } from "@/components/admin/ExamTemplateQuestionsDialog";
import { FilePlus2, Loader2, Plus, Pencil, ListChecks, Power, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/exam-templates")({
  component: AdminExamTemplatesPage,
});

const MODE_LABEL: Record<string, string> = {
  training: "تدريب",
  strict: "اختبار جاد",
};

type TemplateRow = ExamTemplateValue & {
  questions_count: number;
  subject_name: string | null;
  unit_title: string | null;
  lesson_title: string | null;
};

function AdminExamTemplatesPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const queryClient = useQueryClient();

  const [dialogState, setDialogState] = useState<
    { kind: "closed" } | { kind: "create" } | { kind: "edit"; tpl: ExamTemplateValue }
  >({ kind: "closed" });
  const [questionsFor, setQuestionsFor] = useState<{ id: string; title: string } | null>(null);

  const templatesQ = useQuery({
    enabled,
    queryKey: ["admin-exam-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_templates")
        .select(
          `
          id, title, description, mode, subject_id, unit_id, lesson_id,
          duration_seconds, is_active, created_at,
          subject:subjects!exam_templates_subject_id_fkey(name),
          unit:units!exam_templates_unit_id_fkey(title),
          lesson:lessons!exam_templates_lesson_id_fkey(title),
          questions:exam_template_questions(count)
        `,
        )
        .in("mode", ["training", "strict"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows: TemplateRow[] = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        mode: r.mode,
        subject_id: r.subject_id,
        unit_id: r.unit_id,
        lesson_id: r.lesson_id,
        duration_seconds: r.duration_seconds,
        is_active: r.is_active,
        subject_name: r.subject?.name ?? null,
        unit_title: r.unit?.title ?? null,
        lesson_title: r.lesson?.title ?? null,
        questions_count: r.questions?.[0]?.count ?? 0,
      }));
      return rows;
    },
  });

  const toggleActive = async (tpl: TemplateRow) => {
    const { error } = await supabase
      .from("exam_templates")
      .update({ is_active: !tpl.is_active })
      .eq("id", tpl.id);
    if (error) {
      toast.error("تعذر تحديث الحالة.");
      return;
    }
    toast.success(tpl.is_active ? "تم تعطيل القالب." : "تم تفعيل القالب.");
    queryClient.invalidateQueries({ queryKey: ["admin-exam-templates"] });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          جارٍ التحقق من الصلاحيات…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          ليست لديك صلاحية الوصول لهذه الصفحة.
        </div>
      </AdminLayout>
    );
  }

  const rows = templatesQ.data ?? [];

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FilePlus2 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-bold text-foreground">قوالب اختبارات مخصصة</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                أنشئ اختبارًا إضافيًا من بنك الأسئلة عند الحاجة فقط.{" "}
                {"هذه القوالب ليست من محتويات الدرس السبعة، ولا من أرشيف النماذج الوزارية."}
              </p>
            </div>
          </div>
          <Button onClick={() => setDialogState({ kind: "create" })} className="gap-1">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">قالب جديد</span>
          </Button>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-2">
            <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">ثلاثة مسارات منفصلة</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                أسئلة الكتاب و«اختبر نفسك» تُرفعان من استيراد محتويات الدرس. أما النماذج الوزارية
                فلها صفحة استيراد ونشر مستقلة. لا تظهر القوالب الوزارية في هذه القائمة، ولا يمكن
                إنشاء قالب وزاري من هنا.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/admin/import"
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              استيراد مكونات الدرس
            </Link>
            <Link
              to="/admin/ministerial-exams"
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              إدارة النماذج الوزارية
            </Link>
          </div>
        </div>

        {templatesQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : templatesQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            تعذر تحميل القوالب.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            لا توجد قوالب مخصصة، وهذا طبيعي. أنشئ قالبًا فقط عندما تحتاج اختبارًا إضافيًا خارج
            محتويات الدرس الأساسية.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((tpl) => (
              <li
                key={tpl.id}
                className="rounded-xl border border-border bg-card p-4 shadow-card space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{tpl.title}</h3>
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                        {MODE_LABEL[tpl.mode] ?? tpl.mode}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          tpl.is_active
                            ? "bg-green-500/15 text-green-700 dark:text-green-400"
                            : "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {tpl.is_active ? "فعّال" : "غير فعّال"}
                      </span>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {tpl.description}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      {tpl.subject_name && <span>المادة: {tpl.subject_name}</span>}
                      {tpl.unit_title && <span>الوحدة: {tpl.unit_title}</span>}
                      {tpl.lesson_title && <span>الدرس: {tpl.lesson_title}</span>}
                      <span>الأسئلة: {tpl.questions_count}</span>
                      {tpl.duration_seconds != null && (
                        <span>المدة: {Math.round(tpl.duration_seconds / 60)} دقيقة</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setQuestionsFor({ id: tpl.id, title: tpl.title })}
                  >
                    <ListChecks className="h-4 w-4" />
                    إدارة الأسئلة
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setDialogState({ kind: "edit", tpl })}
                  >
                    <Pencil className="h-4 w-4" />
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => toggleActive(tpl)}
                  >
                    <Power className="h-4 w-4" />
                    {tpl.is_active ? "تعطيل" : "تفعيل"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ExamTemplateEditDialog
        open={dialogState.kind !== "closed"}
        onOpenChange={(o) => {
          if (!o) setDialogState({ kind: "closed" });
        }}
        mode={dialogState.kind === "edit" ? "edit" : "create"}
        template={dialogState.kind === "edit" ? dialogState.tpl : null}
      />

      <ExamTemplateQuestionsDialog
        open={questionsFor !== null}
        onOpenChange={(o) => {
          if (!o) setQuestionsFor(null);
        }}
        templateId={questionsFor?.id ?? null}
        templateTitle={questionsFor?.title}
      />
    </AdminLayout>
  );
}
