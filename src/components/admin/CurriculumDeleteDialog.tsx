import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, Loader2 } from "lucide-react";

export type CurriculumEntityType = "subject" | "unit" | "lesson" | "question" | "exam_template";

export interface CurriculumDeleteTarget {
  type: CurriculumEntityType;
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: CurriculumDeleteTarget | null;
  onDeleted?: () => void;
}

interface DeletePreview {
  entity_type: string;
  entity_id: string;
  label: string | null;
  counts: Record<string, number>;
  blockers: string[];
  deletable: boolean;
}

const ENTITY_LABEL: Record<CurriculumEntityType, string> = {
  subject: "المادة",
  unit: "الوحدة",
  lesson: "الدرس",
  question: "السؤال",
  exam_template: "قالب الاختبار",
};

const COUNT_LABEL: Record<string, string> = {
  subjects: "مادة",
  units: "وحدة",
  lessons: "درساً",
  lesson_book_contents: "محتوى كتاب",
  lesson_summaries: "ملخصاً",
  lesson_explanations: "شرحاً",
  lesson_resources: "مورداً",
  lesson_assessments: "تقييماً",
  assessment_questions: "رابط سؤال بتقييم",
  questions: "سؤالاً",
  question_revisions: "نسخة سؤال",
  question_targets: "وجهة سؤال",
  question_options: "خيار إجابة",
  exam_templates: "قالب اختبار",
  exam_template_questions: "رابط سؤال بقالب",
};

const BLOCKER_LABEL: Record<string, string> = {
  STUDENT_PROGRESS: "تقدّم طلاب مسجّل",
  CERTIFICATES: "شهادات صادرة",
  EXAM_SESSIONS: "جلسات امتحان",
  EXAM_SESSION_SNAPSHOTS: "لقطات أسئلة داخل جلسات امتحان",
  PRACTICE_SNAPSHOTS: "لقطات أسئلة داخل محاولات تدريب",
  UNIT_PRACTICE_ATTEMPTS: "محاولات تدريب على الوحدة",
  PUBLISHED_QUESTION_REVISIONS: "نسخ أسئلة منشورة",
  REFERENCED_BY_EXAM_TEMPLATES: "أسئلة مرتبطة بقوالب اختبارات",
};

function describeBlocker(raw: string): string {
  const [key, count] = raw.split(":");
  return `${BLOCKER_LABEL[key ?? ""] ?? key} — ${count}`;
}

export function CurriculumDeleteDialog({ open, onOpenChange, target, onDeleted }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const enabled = open && !!target;

  const previewQ = useQuery({
    enabled,
    queryKey: ["curriculum-delete-preview", target?.type, target?.id],
    queryFn: async (): Promise<DeletePreview> => {
      const { data, error } = await supabase.rpc("admin_curriculum_delete_preview", {
        _entity_type: target!.type,
        _entity_id: target!.id,
      });
      if (error) throw error;
      return data as unknown as DeletePreview;
    },
  });

  const preview = previewQ.data;
  const impact = preview
    ? Object.entries(preview.counts).filter(([, n]) => Number(n) > 0)
    : [];


  const runDelete = async () => {
    if (!target) return;
    setDeleting(true);
    const { error } = await supabase.rpc("admin_curriculum_delete", {
      _entity_type: target.type,
      _entity_id: target.id,
      _reason: "admin curriculum management",
    });
    setDeleting(false);

    if (error) {
      toast.error(
        error.message.includes("DELETE_BLOCKED")
          ? "الحذف ممنوع — يوجد نشاط طلابي أو محتوى منشور. استخدم الأرشفة."
          : error.message.includes("FORBIDDEN")
            ? "هذه العملية متاحة لمدير كامل الصلاحيات فقط."
            : `تعذر الحذف: ${error.message}`,
      );
      return;
    }

    toast.success("تم الحذف وتسجيله في سجل التدقيق");
    await queryClient.invalidateQueries();
    onOpenChange(false);
    onDeleted?.();
  };

  const handleDelete = () => runDelete();


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            حذف {target ? ENTITY_LABEL[target.type] : ""}
          </DialogTitle>
          <DialogDescription className="text-right">
            {target?.label}
          </DialogDescription>
        </DialogHeader>

        {previewQ.isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ حساب أثر الحذف…
          </div>
        )}

        {previewQ.isError && (
          <p className="py-4 text-sm text-destructive">
            تعذر حساب أثر الحذف: {(previewQ.error as Error).message}
          </p>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">سيتم حذف:</p>
              {impact.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا شيء — الكيان فارغ.</p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {impact.map(([key, n]) => (
                    <li key={key}>
                      {n} {COUNT_LABEL[key] ?? key}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!preview.deletable && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  "الحذف ممنوع — استخدم أداة التنظيف التجريبي الجماعي أو الأرشفة"
                </p>
                <ul className="space-y-1 text-sm text-destructive/90">
                  {preview.blockers.map((b) => (
                    <li key={b}>{describeBlocker(b)}</li>
                  ))}
                </ul>

              </div>
            )}

            {!isAdmin && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                معاينة فقط — تنفيذ الحذف متاح لمدير كامل الصلاحيات فقط (يُفرض داخل الخادم).
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              الحذف يتم دفعة واحدة داخل القاعدة ويُسجَّل في سجل التدقيق باسم المنفّذ.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            variant="destructive"
            disabled={!isAdmin || !preview?.deletable || deleting}
            onClick={handleDelete}
          >
            {deleting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            تأكيد الحذف
          </Button>

          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            إلغاء
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
