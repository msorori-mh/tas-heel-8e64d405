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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type LessonBasicEditValue = {
  id: string;
  title: string;
  sort_order: number;
  duration: string | null;
  subject_id: string;
  subject_name?: string | null;
  unit_id: string | null;
  unit_name?: string | null;
  is_free: boolean | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson?: LessonBasicEditValue | null;
}

export function LessonBasicEditDialog({ open, onOpenChange, lesson }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [duration, setDuration] = useState("");
  const [isFree, setIsFree] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSaving(false);
      return;
    }
    if (lesson) {
      setTitle(lesson.title ?? "");
      setSortOrder(lesson.sort_order ?? 0);
      setDuration(lesson.duration ?? "");
      setIsFree(lesson.is_free ?? false);
      setError(null);
      setSaving(false);
    }
  }, [open, lesson]);

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("عنوان الدرس مطلوب.");
      return;
    }

    const order = Number(sortOrder);
    if (!Number.isFinite(order) || order < 0 || !Number.isInteger(order)) {
      setError("الترتيب يجب أن يكون رقمًا صحيحًا غير سالب.");
      return;
    }

    // duration: empty string → null; otherwise trimmed string
    const trimmedDuration = duration.trim();
    const durationValue: string | null = trimmedDuration.length > 0 ? trimmedDuration : null;

    if (!lesson) {
      setError("لا يوجد درس محدد للتعديل.");
      return;
    }

    const payload: {
      title: string;
      sort_order: number;
      duration: string | null;
      is_free: boolean;
    } = {
      title: trimmedTitle,
      sort_order: order,
      duration: durationValue,
      is_free: !!isFree,
    };

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("lessons")
        .update(payload)
        .eq("id", lesson.id);

      if (updateError) throw updateError;

      toast.success("تم تحديث الدرس بنجاح.");
      queryClient.invalidateQueries({ queryKey: ["admin-lessons"] });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(`تعذر تحديث الدرس.${msg ? " " + msg : ""}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          setSaving(false);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل الدرس</DialogTitle>
          <DialogDescription className="text-right">
            يمكنك تعديل البيانات الأساسية للدرس هنا.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-right">
            {error}
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lesson-title">عنوان الدرس</Label>
            <Input
              id="lesson-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              dir="rtl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-order">الترتيب</Label>
              <Input
                id="lesson-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-duration">المدة</Label>
              <Input
                id="lesson-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="مثال: 45 دقيقة"
                disabled={saving}
                dir="rtl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-subject">المادة</Label>
              <Input
                id="lesson-subject"
                value={lesson?.subject_name || "—"}
                disabled
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-unit">الوحدة</Label>
              <Input
                id="lesson-unit"
                value={lesson?.unit_name || "—"}
                disabled
                dir="rtl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>حالة الوصول</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="lesson-is-free"
                  checked={isFree}
                  onChange={() => setIsFree(true)}
                  className="h-4 w-4 accent-primary"
                  disabled={saving}
                />
                مجاني
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="lesson-is-free"
                  checked={!isFree}
                  onChange={() => setIsFree(false)}
                  className="h-4 w-4 accent-primary"
                  disabled={saving}
                />
                ضمن الاشتراك
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              "حفظ التعديلات"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LessonBasicEditDialog;
