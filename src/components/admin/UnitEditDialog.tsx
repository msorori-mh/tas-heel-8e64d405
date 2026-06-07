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
  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isFree, setIsFree] = useState(false);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    if (unit) {
      setTitle(unit.title ?? "");
      setSortOrder(unit.sort_order ?? 0);
      setIsFree(unit.is_free ?? false);
      setDescription(unit.description ?? "");
    }
  }, [open, unit]);

  const handleSave = () => {
    // UI only — no database writes in this phase
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل الوحدة</DialogTitle>
          <DialogDescription className="text-right">
            يمكنك تعديل بيانات الوحدة هنا. الحفظ سيتوفر في المرحلة التالية.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="unit-title">عنوان الوحدة</Label>
            <Input
              id="unit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
              dir="rtl"
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
          >
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled>
            الحفظ في المرحلة التالية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnitEditDialog;
