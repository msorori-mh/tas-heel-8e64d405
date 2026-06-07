import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";

export type LessonExplanationItem = {
  id: string;
  lesson_id?: string;
  title: string | null;
  content: string;
  sort_order: number;
  __local?: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  lessonTitle: string | null;
  items: LessonExplanationItem[];
}

let _tmpCounter = 0;
const makeTempId = () => `__tmp_${Date.now()}_${++_tmpCounter}`;
const isLocal = (r: LessonExplanationItem) =>
  r.__local === true || r.id.startsWith("__tmp_");

export function LessonExplanationsDialog({
  open,
  onOpenChange,
  lessonId,
  lessonTitle,
  items,
}: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<LessonExplanationItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErrMsg(null);
      setSaving(false);
      setRows(
        [...items]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((x) => ({ ...x }))
      );
    }
  }, [open, items]);

  const updateRow = (id: string, patch: Partial<LessonExplanationItem>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addLocal = () => {
    const nextSort =
      rows.length === 0
        ? 0
        : Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1;
    setRows((rs) => [
      ...rs,
      {
        id: makeTempId(),
        title: "",
        content: "",
        sort_order: nextSort,
        __local: true,
      },
    ]);
  };

  const removeLocal = (id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    if (saving) return;
    setErrMsg(null);

    // Validation
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const content = (r.content ?? "").trim();
      if (!content) {
        setErrMsg(`المحتوى مطلوب للشرح #${i + 1}.`);
        return;
      }
      const so = Number(r.sort_order);
      if (!Number.isInteger(so) || so < 0) {
        setErrMsg(`الترتيب غير صالح للشرح #${i + 1}.`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const r of rows) {
        const titleTrim = (r.title ?? "").trim();
        const titleOrNull = titleTrim.length > 0 ? titleTrim : null;
        const contentTrim = r.content.trim();
        const sortOrder = Number(r.sort_order);

        if (isLocal(r)) {
          const { error } = await supabase
            .from("lesson_explanations")
            .insert({
              lesson_id: lessonId,
              title: titleOrNull,
              content: contentTrim,
              sort_order: sortOrder,
            });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("lesson_explanations")
            .update({
              title: titleOrNull,
              content: contentTrim,
              sort_order: sortOrder,
            })
            .eq("id", r.id);
          if (error) throw error;
        }
      }

      toast.success("تم حفظ شروحات الدرس بنجاح.");
      await qc.invalidateQueries({
        queryKey: ["admin-lesson-detail", "explanations", lessonId],
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("تعذر حفظ شروحات الدرس.");
      setErrMsg(
        e?.message ? `تعذر الحفظ: ${e.message}` : "تعذر حفظ شروحات الدرس."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (!saving ? onOpenChange(o) : null)}
    >
      <DialogContent
        dir="rtl"
        className="max-w-2xl text-right max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            إدارة شروحات الدرس
            {lessonTitle ? (
              <span className="block text-xs font-normal text-muted-foreground mt-1">
                {lessonTitle}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            يمكنك تعديل الشروحات الموجودة وإضافة شروحات جديدة. حذف الشروحات
            المحفوظة سيتم دعمه لاحقًا.
          </span>
        </div>

        {errMsg && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive text-right">
            {errMsg}
          </div>
        )}

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              لا توجد شروحات لهذا الدرس بعد.
            </p>
          ) : (
            rows.map((r, idx) => {
              const local = isLocal(r);
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      شرح #{idx + 1}
                      {local && (
                        <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                          جديد محليًا
                        </span>
                      )}
                    </span>
                    {local ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLocal(r.id)}
                        disabled={saving}
                        className="h-7 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 ml-1" />
                        حذف من الواجهة
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        حذف الشرح المحفوظ سيتم دعمه لاحقًا.
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-muted-foreground">
                        العنوان
                      </label>
                      <Input
                        value={r.title ?? ""}
                        onChange={(e) =>
                          updateRow(r.id, { title: e.target.value })
                        }
                        placeholder="عنوان الشرح (اختياري)"
                        className="text-right"
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">
                        الترتيب
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={r.sort_order ?? 0}
                        onChange={(e) =>
                          updateRow(r.id, {
                            sort_order: Number(e.target.value) || 0,
                          })
                        }
                        className="text-right"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground">
                      المحتوى
                    </label>
                    <Textarea
                      value={r.content ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, { content: e.target.value })
                      }
                      rows={6}
                      className="text-right"
                      placeholder="نص الشرح…"
                      disabled={saving}
                    />
                  </div>
                </div>
              );
            })
          )}

          <Button
            type="button"
            variant="outline"
            onClick={addLocal}
            disabled={saving}
            className="w-full"
          >
            <Plus className="h-4 w-4 ml-1" />
            إضافة شرح
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إغلاق
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                جاري الحفظ...
              </>
            ) : (
              "حفظ"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
