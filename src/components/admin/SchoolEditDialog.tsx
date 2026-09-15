import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { schoolDirectoryApi as api } from "@/lib/schools/student-school-api";
import type { ManagedSchool } from "@/lib/schools/directory-api";
import { toast } from "sonner";

export function SchoolEditDialog({
  school,
  governorates,
  onClose,
  onSaved,
}: {
  school: ManagedSchool;
  governorates: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    governorate_id: school.governorate_id,
    name: school.name,
    district: school.district,
    locality: school.locality,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = school.student_count + school.teacher_count > 0;
  const change = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors({});
    setError("");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent dir="rtl" className="w-[95vw] max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-6 text-right sm:text-right">
          <DialogTitle>تعديل بيانات المدرسة</DialogTitle>
          <DialogDescription>
            ستتحدث بيانات المدرسة لدى الطلاب والمعلمين المرتبطين بها مع بقاء ارتباطاتهم.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const result = await api.edit(school, form);
              setErrors(result.errors);
              if (result.school) {
                toast.success("تم حفظ بيانات المدرسة.");
                await onSaved();
                onClose();
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "تعذّر حفظ التعديلات.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <div>
              <Label htmlFor="edit-school-governorate">المحافظة</Label>
              <select
                id="edit-school-governorate"
                className="min-h-11 w-full rounded-md border bg-background px-3"
                value={form.governorate_id}
                disabled={linked}
                onChange={(e) => change("governorate_id", e.target.value)}
                aria-invalid={!!errors.governorate}
                aria-describedby="edit-school-governorate-note"
              >
                {governorates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <p id="edit-school-governorate-note" className="text-sm text-muted-foreground">
                {linked &&
                  "المحافظة ثابتة ما دامت المدرسة مرتبطة بطلاب أو معلمين، لحماية إعدادات مناهجهم."}
              </p>
              {errors.governorate && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.governorate}
                </p>
              )}
            </div>
            {(
              [
                ["district", "المديرية", 120],
                ["name", "اسم المدرسة", 180],
                ["locality", "الحي أو القرية (اختياري)", 120],
              ] as const
            ).map(([key, label, max]) => (
              <div key={key}>
                <Label htmlFor={`edit-school-${key}`}>{label}</Label>
                <Input
                  id={`edit-school-${key}`}
                  value={form[key]}
                  maxLength={max}
                  onChange={(e) => change(key, e.target.value)}
                  aria-invalid={!!errors[key]}
                  aria-describedby={`edit-school-${key}-error`}
                />
                <p
                  id={`edit-school-${key}-error`}
                  role={errors[key] ? "alert" : undefined}
                  className="text-sm text-destructive"
                >
                  {errors[key]}
                </p>
              </div>
            ))}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}</Button>
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
