import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  deleteMinisterialModelQuestion,
  listMinisterialModelQuestions,
  updateMinisterialModelQuestion,
  type MinisterialAdminQuestion,
  type MinisterialModelRow,
} from "@/lib/ministerial/ministerial-admin-api";

export function MinisterialQuestionsManager({
  model,
  onChanged,
}: {
  model: MinisterialModelRow;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<MinisterialAdminQuestion[]>([]);
  const [editing, setEditing] = useState<MinisterialAdminQuestion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setQuestions(await listMinisterialModelQuestions(model.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل الأسئلة");
    } finally {
      setBusy(false);
    }
  }, [model.id]);
  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await updateMinisterialModelQuestion(model.id, editing, "تعديل إداري من شاشة النموذج");
      toast.success("تم تعديل السؤال وأعيد النموذج إلى مسودة للمراجعة.");
      setEditing(null);
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل التعديل");
    } finally {
      setBusy(false);
    }
  }

  async function remove(question: MinisterialAdminQuestion) {
    if (!confirm(`حذف السؤال ${question.question_code} من هذا النموذج؟`)) return;
    setBusy(true);
    try {
      await deleteMinisterialModelQuestion(
        model.id,
        question.question_id,
        "حذف إداري من شاشة النموذج",
      );
      toast.success("تم حذف السؤال من النموذج وأعيد النموذج إلى مسودة.");
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحذف");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="ms-1 h-4 w-4" />
          الأسئلة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أسئلة {model.model_label ?? model.model_code}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          يمكن التعديل والحذف ما دام النموذج بلا محاولات طلابية. أي تعديل يعيده تلقائيًا إلى مسودة
          قبل إعادة النشر.
        </p>
        {busy && questions.length === 0 ? (
          <p>جاري التحميل…</p>
        ) : (
          questions.map((question) => (
            <div
              key={question.question_id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <div className="text-xs text-muted-foreground">
                  #{question.display_order} · {question.question_code}
                </div>
                <p className="mt-1 text-sm">{question.question_text}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setEditing(structuredClone(question))}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="destructive" onClick={() => void remove(question)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
        {!busy && questions.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد أسئلة في النموذج.</p>
        )}
        {editing && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <Label>نص السؤال</Label>
            <Textarea
              value={editing.question_text}
              onChange={(e) => setEditing({ ...editing, question_text: e.target.value })}
            />
            {model.track_code === "sanaa" &&
              editing.options.map((option, index) => (
                <div key={option.option_code} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={option.is_correct}
                    onChange={() =>
                      setEditing({
                        ...editing,
                        options: editing.options.map((item, i) => ({
                          ...item,
                          is_correct: i === index,
                        })),
                      })
                    }
                  />
                  <Input
                    value={option.body}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        options: editing.options.map((item, i) =>
                          i === index ? { ...item, body: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            {model.track_code === "aden" && (
              <>
                <Label>الإجابة النموذجية</Label>
                <Textarea
                  value={editing.model_answer ?? ""}
                  onChange={(e) => setEditing({ ...editing, model_answer: e.target.value })}
                />
              </>
            )}
            <Label>الشرح</Label>
            <Textarea
              value={editing.explanation ?? ""}
              onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>الترتيب</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.display_order}
                  onChange={(e) =>
                    setEditing({ ...editing, display_order: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>الدرجة</Label>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={editing.marks}
                  onChange={(e) => setEditing({ ...editing, marks: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void save()}>
                حفظ التعديل
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
