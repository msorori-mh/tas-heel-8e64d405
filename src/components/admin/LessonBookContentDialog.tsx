import { useEffect, useState } from "react";
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
import { Pencil } from "lucide-react";

export type BookContentItem = {
  id: string;
  content: string | null;
  sort_order: number | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonTitle?: string | null;
  items: BookContentItem[];
}

export function LessonBookContentDialog({
  open,
  onOpenChange,
  lessonTitle,
  items,
}: Props) {
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open) return;
    if (items.length === 0) {
      setContent("");
      return;
    }
    // Pick first item by sort_order
    const sorted = [...items].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    setContent(sorted[0].content ?? "");
  }, [open, items]);

  const charCount = content.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        {items.length > 1 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 text-right">
            يوجد أكثر من محتوى، التحرير المتعدد سيُضاف لاحقًا.
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
            className="resize-y"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button disabled>
            الحفظ في المرحلة التالية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LessonBookContentDialog;
