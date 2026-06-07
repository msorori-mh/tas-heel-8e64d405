import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Pencil, Loader2 } from "lucide-react";

export type BookContentItem = {
  id: string;
  content: string | null;
  sort_order?: number | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  lessonTitle?: string | null;
  items: BookContentItem[];
}

export function LessonBookContentDialog({
  open,
  onOpenChange,
  lessonId,
  lessonTitle,
  items,
}: Props) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const tooMany = items.length > 1;

  useEffect(() => {
    if (!open) return;
    setErrMsg(null);
    setSaving(false);
    if (items.length === 0) {
      setContent("");
      return;
    }
    const sorted = [...items].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    setContent(sorted[0].content ?? "");
  }, [open, items]);

  const charCount = content.length;

  const handleSave = async () => {
    if (saving) return;
    setErrMsg(null);

    if (tooMany) {
      setErrMsg("يوجد أكثر من محتوى لهذا الدرس، سيتم دعم التحرير المتعدد لاحقًا.");
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      setErrMsg("محتوى الكتاب مطلوب.");
      return;
    }

    setSaving(true);
    try {
      if (items.length === 1) {
        const existing = items[0];
        const { error } = await supabase
          .from("lesson_book_contents")
          .update({ content: trimmed })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lesson_book_contents")
          .insert({
            lesson_id: lessonId,
            content: trimmed,
          });
        if (error) throw error;
      }

      toast.success("تم حفظ محتوى الكتاب بنجاح.");
      await qc.invalidateQueries({
        queryKey: ["admin-lesson-detail", "book", lessonId],
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("تعذر حفظ محتوى الكتاب.");
      setErrMsg(e?.message ? `تعذر الحفظ: ${e.message}` : "تعذر حفظ محتوى الكتاب.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!saving ? onOpenChange(o) : null)}>
      <DialogContent dir="rtl" className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            تحرير محتوى الكتاب
          </DialogTitle>
          <DialogDescription className="text-right">
            {lessonTitle ? `الدرس: ${lessonTitle}` : "تحرير محتوى الكتاب المرتبط بالدرس."}
          </DialogDescription>
        </DialogHeader>

        {tooMany && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 text-right">
            يوجد أكثر من محتوى لهذا الدرس، سيتم دعم التحرير المتعدد لاحقًا.
          </div>
        )}

        {errMsg && !tooMany && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive text-right">
            {errMsg}
          </div>
        )}

        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="book-content">المحتوى</Label>
            <span className="text-[11px] text-muted-foreground">
              {charCount.toLocaleString("ar-SA")} حرف
            </span>
          </div>
          <Textarea
            id="book-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            dir="rtl"
            disabled={saving || tooMany}
            className="resize-y"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving || tooMany}>
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

export default LessonBookContentDialog;
