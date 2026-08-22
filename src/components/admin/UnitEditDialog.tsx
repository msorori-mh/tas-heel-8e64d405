import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
import { createCurriculumUnitAdmin } from "@/lib/content-codes/content-codes.functions";

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
  mode?: "edit" | "create";
  subjects?: { id: string; name: string | null; grade_id: string | null }[];
  grades?: { id: string; name: string | null }[];
}

export function UnitEditDialog({ open, onOpenChange, unit, mode = "edit", subjects = [], grades = [] }: Props) {
  const queryClient = useQueryClient();
  const createUnitFn = useServerFn(createCurriculumUnitAdmin);
  const isCreate = mode === "create";

  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isFree, setIsFree] = useState(false);
  const [description, setDescription] = useState("");
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSaving(false);
      return;
    }
    if (isCreate) {
      setTitle("");
      setSortOrder(0);
      setIsFree(false);
      setDescription("");
      setSelectedGradeId("");
      setSelectedSubjectId("");
      setError(null);
    } else if (unit) {
      setTitle(unit.title ?? "");
      setSortOrder(unit.sort_order ?? 0);
      setIsFree(unit.is_free ?? false);
      setDescription(unit.description ?? "");
      setSelectedGradeId("");
      setSelectedSubjectId(unit.subject_id ?? "");
      setError(null);
    }
  }, [open, unit, isCreate]);

  const filteredSubjects = useMemo(
    () => selectedGradeId ? subjects.filter((subject) => subject.grade_id === selectedGradeId) : [],
    [subjects, selectedGradeId],
  );

  const handleSave = async () => {
    setError(null);

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

    if (isCreate) {
      if (!selectedGradeId || !grades.some((grade) => grade.id === selectedGradeId)) {
        setError("اختيار الصف مطلوب.");
        return;
      }
      if (!selectedSubjectId) {
        setError("اختيار المادة مطلوب.");
        return;
      }
      const subjectExists = filteredSubjects.some((s) => s.id === selectedSubjectId);
      if (!subjectExists) {
        setError("المادة المختارة غير موجودة.");
        return;
      }

      setSaving(true);
      try {
        const created = await createUnitFn({
          data: {
            title: trimmedTitle,
            subjectId: selectedSubjectId,
            sortOrder: order,
            isFree: !!isFree,
            description: description.trim().length > 0 ? description.trim() : null,
          },
        });

        toast.success(`تم إنشاء الوحدة بالكود ${created.code}.`);
        queryClient.invalidateQueries({ queryKey: ["admin-units"] });
        onOpenChange(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setError(`تعذر إنشاء الوحدة.${msg ? " " + msg : ""}`);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!unit) {
      setError("لا توجد وحدة محددة للتعديل.");
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
  };

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
          <DialogTitle className="text-right">
            {isCreate ? "إضافة وحدة" : "تعديل الوحدة"}
          </DialogTitle>
          <DialogDescription className="text-right">
            {isCreate
              ? "أدخل بيانات الوحدة؛ ينشئ النظام كود TCS-2 تلقائيًا."
              : "يمكنك تعديل بيانات الوحدة هنا."}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Label htmlFor="unit-grade">الصف</Label>
              {isCreate ? (
                <select
                  id="unit-grade"
                  value={selectedGradeId}
                  onChange={(e) => {
                    setSelectedGradeId(e.target.value);
                    setSelectedSubjectId("");
                  }}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">اختر الصف أولاً…</option>
                  {grades.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name || "—"}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="unit-grade"
                  value="يُحدد من المادة"
                  disabled
                  dir="rtl"
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit-subject">المادة</Label>
            {isCreate ? (
              <select
                id="unit-subject"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={!selectedGradeId || saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">{selectedGradeId ? "اختر المادة…" : "اختر الصف أولاً"}</option>
                {filteredSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name || "—"}</option>
                ))}
              </select>
            ) : (
              <Input id="unit-subject" value={unit?.subject_name || "—"} disabled dir="rtl" />
            )}
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
            ) : isCreate ? (
              "إنشاء"
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

