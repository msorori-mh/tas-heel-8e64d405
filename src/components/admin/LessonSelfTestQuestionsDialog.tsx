import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Option = { option_code: string; body: string; is_correct: boolean };
type Question = {
  question_id: string;
  revision_id: string;
  question_code: string;
  question_text: string;
  display_order: number;
  options: Option[];
  explanation: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  params: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function LessonSelfTestQuestionsDialog({
  lessonId,
  open,
  onOpenChange,
  onChanged,
}: {
  lessonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await rpc("lesson_self_test_questions_admin_list", {
      _lesson_id: lessonId,
    });
    setLoading(false);
    if (error) {
      toast.error(`تعذر تحميل أسئلة اختبر فهمك: ${error.message}`);
      return;
    }
    setQuestions((data as Question[] | null) ?? []);
  }, [lessonId]);

  useEffect(() => {
    if (open) void load();
    else setEditing(null);
  }, [open, load]);

  const save = async () => {
    if (!editing) return;
    const correct = editing.options.find((option) => option.is_correct)?.option_code;
    if (!editing.question_text.trim() || !editing.explanation?.trim() || !correct) {
      toast.error("أدخل نص السؤال والتصويب وحدد إجابة صحيحة واحدة.");
      return;
    }
    setSaving(true);
    const { error } = await rpc("lesson_self_test_question_update", {
      _lesson_id: lessonId,
      _question_id: editing.question_id,
      _question_text: editing.question_text,
      _options: editing.options.map(({ option_code, body }) => ({ option_code, body })),
      _correct_option_code: correct,
      _explanation: editing.explanation,
      _display_order: editing.display_order,
      _reason: "تعديل فقرة اختبر فهمك من لوحة المحتوى",
    });
    setSaving(false);
    if (error) {
      toast.error(`تعذر حفظ السؤال: ${error.message}`);
      return;
    }
    toast.success("حُفظ السؤال في إصدار جديد وبقيت المحاولات السابقة محفوظة.");
    setEditing(null);
    await load();
    await onChanged();
  };

  const remove = async (question: Question) => {
    if (!window.confirm(`حذف السؤال «${question.question_text}» من اختبر فهمك؟`)) return;
    const { error } = await rpc("lesson_self_test_question_delete", {
      _lesson_id: lessonId,
      _question_id: question.question_id,
      _reason: "حذف فقرة اختبر فهمك من لوحة المحتوى",
    });
    if (error) {
      toast.error(`تعذر حذف السؤال: ${error.message}`);
      return;
    }
    toast.success("حُذف السؤال من العرض الحالي مع حفظ سجل الإصدارات والمحاولات السابقة.");
    await load();
    await onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>إدارة أسئلة «اختبر فهمك»</DialogTitle>
          <DialogDescription>
            عدّل السؤال وخياراته والإجابة الصحيحة والتصويب، أو احذف فقرة منفردة.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل الأسئلة…</p>
        ) : questions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد أسئلة منشورة لهذا الدرس.
          </p>
        ) : (
          <div className="space-y-3">
            {questions.map((question, index) => (
              <div key={question.question_id} className="rounded-xl border border-border p-3">
                {editing?.question_id === question.question_id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editing.question_text}
                      onChange={(event) =>
                        setEditing({ ...editing, question_text: event.target.value })
                      }
                      aria-label="نص السؤال"
                    />
                    {editing.options.map((option, optionIndex) => (
                      <div key={option.option_code} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${editing.question_id}`}
                          checked={option.is_correct}
                          onChange={() =>
                            setEditing({
                              ...editing,
                              options: editing.options.map((item, itemIndex) => ({
                                ...item,
                                is_correct: itemIndex === optionIndex,
                              })),
                            })
                          }
                          aria-label={`الإجابة الصحيحة ${option.option_code}`}
                        />
                        <span className="w-6 text-xs font-bold">{option.option_code}</span>
                        <Input
                          value={option.body}
                          onChange={(event) =>
                            setEditing({
                              ...editing,
                              options: editing.options.map((item, itemIndex) =>
                                itemIndex === optionIndex
                                  ? { ...item, body: event.target.value }
                                  : item,
                              ),
                            })
                          }
                          aria-label={`نص الخيار ${option.option_code}`}
                        />
                      </div>
                    ))}
                    <Textarea
                      value={editing.explanation ?? ""}
                      onChange={(event) =>
                        setEditing({ ...editing, explanation: event.target.value })
                      }
                      placeholder="التصويب أو تفسير الإجابة"
                      aria-label="التصويب"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                        إلغاء
                      </Button>
                      <Button size="sm" onClick={() => void save()} disabled={saving}>
                        {saving ? "جارٍ الحفظ…" : "حفظ إصدار جديد"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {index + 1}. {question.question_text}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        الإجابة الصحيحة:{" "}
                        {question.options.find((option) => option.is_correct)?.body ?? "غير محددة"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(structuredClone(question))}
                      >
                        <Pencil /> تعديل
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => void remove(question)}>
                        <Trash2 /> حذف
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
