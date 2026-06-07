import { useEffect, useState, useCallback } from "react";
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

export type UnitEditValue = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_free: boolean;
  subject_id: string;
  subject_name?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit?: UnitEditValue | null;
}

export function UnitEditDialog({ open, onOpenChange, unit }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isFree, setIsFree] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSaving(false);
      return;
    }
    if (unit) {
      setTitle(unit.title ?? "");
      setSortOrder(unit.sort_order ?? 0);
      setIsFree(unit.is_free ?? false);
      setDescription(unit.description ?? "");
      setError(null);
    }
  }, [open, unit]);

  const handleSave = useCallback(async () => {
    setError(null);

    if (!unit) {
      setError("لا توجد وحدة محددة للتعديل.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("عنوان الوحدة مطلوب.");
      return;
    }

    const order = Number(sortOrder);
    if (!Number.isFinite(order) || order < 0 || !Number.isInteger(order)) {
      setError("الترتيب يجب أن يكون رقمًا صحيحًا غير سالب.");
      return;
    }

    const payload: {
      title: string;
      sort_order: number;
      is_free: boolean;
      description?: string | null;
    } = {
      title: trimmedTitle,
      sort_order: order,
      is_free: !!isFree,
    };

    if (description.trim().length > 0) {
      payload.description = description.trim();
    } else {
      payload.description = null;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("units")
        .update(payload)
        .eq("id", unit.id);

      if (updateError) throw updateError;

      toast.success("تم تحديث الوحدة بنجاح.");
      queryClient.invalidateQueries({ queryKey: ["admin-units"] });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(`تعذر تحديث الوحدة.${msg ? " " + msg : ""}`);
    } finally {
      setSaving(false);
    }
  }, [unit, title, sortOrder, isFree, description, onOpenChange, queryClient]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل الوحدة</DialogTitle>
          <DialogDescription className="text-right">
            يمكنك تعديل بيانات الوحدة هنا.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-right">
            {error}
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="unit-title">عنوان الوحدة</Label>
            <Input
              id="unit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              dir="rtl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unit-order">الترتيب</Label>
              <Input
                id="unit-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-subject">المادة</Label>
              <Input
                id="unit-subject"
                value={unit?.subject_name || "—"}
                disabled
                dir="rtl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit-desc">الوصف</Label>
            <textarea
              id="unit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none disabled:opacity-50"
              dir="rtl"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label>حالة الوحدة</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="unit-is-free"
                  checked={isFree}
                  onChange={() => setIsFree(true)}
                  className="h-4 w-4 accent-primary"
                  disabled={saving}
                />
                مجانية
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="unit-is-free"
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
              "حفظ"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnitEditDialog;
