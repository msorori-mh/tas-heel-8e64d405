import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type PurgeStatus = {
  scope_version: number;
  enabled: boolean;
  locked_at: string | null;
  counts: Record<string, number>;
  preview_sha256: string;
  manifest_row_count: number;
  confirmation_phrase: string;
  preserved: string[];
  subject_candidates: Array<{
    id: string;
    code: string | null;
    name: string;
    grade_id: string;
  }>;
  textbook_storage_paths: string[];
};

const COUNT_LABEL: Record<string, string> = {
  subjects: "مادة تجريبية",
  subject_curriculum_tracks: "ربط مادة بمسار",
  subject_textbooks: "سجل كتاب مادة",
  content_review_state: "سجل مراجعة ونشر محتوى",
  exam_templates: "قالب اختبار",
  ministerial_exam_models: "نموذجًا وزاريًا",
  units: "وحدة/فصل",
  lessons: "درسًا",
  lesson_book_contents: "محتوى كتاب",
  lesson_explanations: "شرحًا",
  lesson_summaries: "ملخصًا",
  lesson_resources: "موردًا",
  lesson_simulations: "نشاطًا تفاعليًا",
  lesson_assessments: "تقييمًا",
  lesson_capability_lifecycle: "سجل حالة محتوى",
  questions: "سؤالًا",
  question_revisions: "نسخة سؤال",
  question_options: "خيار إجابة",
  question_option_rationales: "تعليل خيار",
  official_question_answers: "إجابة كتاب رسمية",
  question_targets: "ربط سؤال",
  question_media: "وسيط سؤال",
  question_solutions: "حلًا",
  student_progress: "سجل تقدم تجريبي",
  exam_sessions: "جلسة اختبار تجريبية",
  practice_attempts: "محاولة تدريب تجريبية",
  unit_practice_attempts: "محاولة وحدة تجريبية",
  golden_packages: "حزمة درس تجريبية",
  golden_package_versions: "إصدار حزمة",
  golden_stage_batches: "دفعة تجهيز",
  golden_publications: "سجل نشر تجريبي",
  golden_published_assets: "أصلًا منشورًا",
};

const PRESERVED_LABEL: Record<string, string> = {
  grades: "الصفوف",
  curriculum_tracks: "المساران الرسميان (صنعاء وعدن)",
  users: "المستخدمون",
  profiles: "ملفات المستخدمين",
  import_jobs: "سجل عمليات الاستيراد",
  import_staging_rows: "سجل صفوف الاستيراد",
  audit_logs: "سجل التدقيق",
  finance: "المحافظ والمدفوعات والاشتراكات",
  storage_objects: "ملفات التخزين حتى تنظيفها بإجراء مستقل",
  content_code_allocations: "سجل تخصيص الأكواد",
};

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function CurriculumPrelaunchPurgeControl() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);

  const statusQ = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-curriculum-prelaunch-purge-status"],
    queryFn: async (): Promise<PurgeStatus> => {
      const { data, error } = await (supabase as any).rpc(
        "admin_curriculum_prelaunch_purge_status",
      );
      if (error) throw error;
      return data as PurgeStatus;
    },
  });

  const status = statusQ.data;
  const impact = useMemo(
    () => Object.entries(status?.counts ?? {}).filter(([, count]) => Number(count) > 0),
    [status],
  );
  const emptyCurriculum = Number(status?.manifest_row_count ?? 0) === 0;
  const canSubmit =
    !!status?.enabled &&
    !emptyCurriculum &&
    confirmation === status.confirmation_phrase &&
    reason.trim().length >= 12 &&
    !submitting;

  if (!isAdmin) return null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setConfirmation("");
      setReason("");
      setIdempotencyKey(newIdempotencyKey());
      void statusQ.refetch();
    }
  };

  const executePurge = async () => {
    if (!status || !canSubmit) return;
    setSubmitting(true);
    const { error } = await (supabase as any).rpc("admin_curriculum_prelaunch_purge", {
      _confirmation: confirmation,
      _reason: reason.trim(),
      _expected_preview_sha256: status.preview_sha256,
      _idempotency_key: idempotencyKey,
    });
    setSubmitting(false);

    if (error) {
      const message = String(error.message ?? "");
      if (message.includes("PRELAUNCH_PURGE_STALE_PREVIEW")) {
        toast.error("تغيرت البيانات بعد المعاينة. حدّث المعاينة ثم أعد التأكيد.");
        await statusQ.refetch();
      } else if (message.includes("PRELAUNCH_PURGE_LOCKED")) {
        toast.error("تم إغلاق وضع التنظيف التجريبي نهائيًا.");
      } else if (message.includes("FORBIDDEN_FULL_ADMIN_REQUIRED")) {
        toast.error("هذه العملية متاحة لمدير كامل الصلاحيات فقط.");
      } else {
        toast.error(`تعذر تنفيذ التنظيف: ${message}`);
      }
      return;
    }

    toast.success("تم حذف بيانات المحتوى التجريبية والتحقق من النتيجة.");
    setOpen(false);
    await queryClient.invalidateQueries();
  };

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => handleOpenChange(true)}
        disabled={statusQ.isLoading || status?.enabled === false}
        className="gap-1.5"
      >
        {statusQ.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {status?.enabled === false ? "التنظيف التجريبي مغلق" : "تنظيف البيانات التجريبية"}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              حذف جميع بيانات المحتوى التجريبية
            </DialogTitle>
            <DialogDescription className="text-right">
              يشمل النطاق المواد وروابط المسارات والكتب والوحدات والدروس والمحتويات والأسئلة
              التجريبية. العملية ذرية وتفشل كاملة إذا تغير أي معرّف بعد المعاينة.
            </DialogDescription>
          </DialogHeader>

          {statusQ.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ حساب أثر التنظيف…
            </div>
          )}

          {statusQ.isError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              تعذر تحميل المعاينة: {(statusQ.error as Error).message}
            </p>
          )}

          {status && (
            <div className="space-y-4">
              {!status.enabled && (
                <div className="rounded-xl border border-border bg-muted p-4 text-sm">
                  تم إغلاق وضع التنظيف التجريبي نهائيًا
                  {status.locked_at ? ` في ${new Date(status.locked_at).toLocaleString("ar")}` : ""}
                  .
                </div>
              )}

              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  سيتم حذف البيانات التالية نهائيًا
                </p>
                {impact.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد بيانات منهج لحذفها.</p>
                ) : (
                  <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    {impact.map(([key, count]) => (
                      <div
                        key={key}
                        className="flex justify-between gap-3 rounded-md bg-background/70 px-2 py-1"
                      >
                        <span>{COUNT_LABEL[key] ?? key}</span>
                        <strong className="text-foreground">{count}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {status.subject_candidates.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                  <p className="mb-2 font-semibold text-amber-800 dark:text-amber-300">
                    المواد الداخلة في المعاينة — {status.subject_candidates.length}
                  </p>
                  <div className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
                    {status.subject_candidates.map((subject) => (
                      <div key={subject.id} className="rounded bg-background/70 px-2 py-1">
                        {subject.name} · {subject.code ?? "بلا كود"} · {subject.id}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
                <p className="mb-2 font-semibold text-emerald-700 dark:text-emerald-300">
                  لن يتم حذف:
                </p>
                <p className="text-muted-foreground">
                  {status.preserved.map((key) => PRESERVED_LABEL[key] ?? key).join("، ")}.
                </p>
              </div>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">سبب التنظيف — 12 حرفًا على الأقل</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                  placeholder="مثال: إزالة بيانات الاختبار وبدء إدخال المنهج المعتمد"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">اكتب العبارة التالية حرفيًا للتأكيد:</span>
                <code className="block rounded-md bg-muted px-3 py-2 text-xs">
                  {status.confirmation_phrase}
                </code>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-destructive"
                  autoComplete="off"
                />
              </label>

              <p className="text-xs text-muted-foreground">
                بصمة المعاينة مبنية على {status.manifest_row_count} معرّفًا فعليًا، وليست على
                الأعداد فقط. تحتفظ المنصة بسجل التدقيق والاستيراد والبيانات المالية.
                {status.textbook_storage_paths.length > 0
                  ? ` ستبقى ${status.textbook_storage_paths.length} ملفات كتاب في التخزين إلى أن تُنظف بإجراء مستقل ومدقق.`
                  : " لا توجد ملفات كتب منفصلة تحتاج تنظيف تخزين."}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="destructive" disabled={!canSubmit} onClick={executePurge}>
              {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حذف البيانات التجريبية نهائيًا
            </Button>
            <Button variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
