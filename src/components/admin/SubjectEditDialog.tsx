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
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { deriveSubjectSlug } from "@/lib/import/subject-slug";

export type SubjectEditValue = {
  id: string;
  name: string;
  sort_order: number;
  icon: string | null;
  color: string | null;
  curriculum_track_id: string | null;
  grade_id: string;
  code?: string | null;
  group_code?: string | null;
  group_name?: string | null;
};

type GradeOption = { id: string; name: string | null };
type TrackOption = { id: string; track_name: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "edit" | "create";
  subject?: SubjectEditValue | null;
  grades: GradeOption[];
  tracks: TrackOption[];
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Natural codes: lowercase latin letters/digits with - or _ separators (see NAMING-CONVENTION). */
const CODE_RE = /^[a-z0-9]+([-_][a-z0-9]+)*$/;

export function SubjectEditDialog({
  open,
  onOpenChange,
  mode = "edit",
  subject,
  grades,
  tracks,
}: Props) {
  const queryClient = useQueryClient();
  const isCreate = mode === "create";

  const [name, setName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#0d7377");
  const [trackId, setTrackId] = useState<string>("");
  const [gradeId, setGradeId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setName("");
      setSubjectCode("");
      setGroupCode("");
      setGroupName("");
      setSortOrder(0);
      setIcon("");
      setColor("#0d7377");
      setTrackId("");
      setGradeId(grades[0]?.id ?? "");
      setError(null);
      setSaving(false);
    } else if (subject) {
      setName(subject.name ?? "");
      setSubjectCode(subject.code ?? "");
      setGroupCode(subject.group_code ?? "");
      setGroupName(subject.group_name ?? "");
      setSortOrder(subject.sort_order ?? 0);
      setIcon(subject.icon ?? "");
      setColor(subject.color ?? "#0d7377");
      setTrackId(subject.curriculum_track_id ?? "");
      setGradeId(subject.grade_id ?? "");
      setError(null);
      setSaving(false);
    }
  }, [open, isCreate, subject, grades]);

  const gradeName = grades.find((g) => g.id === (isCreate ? gradeId : subject?.grade_id))?.name ?? "—";

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("اسم المادة مطلوب.");
      return;
    }
    if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder) || sortOrder < 0) {
      setError("الترتيب يجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.");
      return;
    }
    const trimmedIcon = icon.trim();
    const trimmedColor = color.trim();
    if (trimmedColor && !HEX_RE.test(trimmedColor)) {
      setError("اللون يجب أن يكون بصيغة hex صالحة مثل #0d7377.");
      return;
    }
    if (trackId && !tracks.some((t) => t.id === trackId)) {
      setError("المسار المحدد غير صالح.");
      return;
    }

    const trimmedCode = subjectCode.trim().toLowerCase();
    const trimmedGroupCode = groupCode.trim().toLowerCase();
    const trimmedGroupName = groupName.trim();
    if (trimmedGroupCode && !CODE_RE.test(trimmedGroupCode)) {
      setError("كود المجموعة يجب أن يكون بحروف لاتينية صغيرة وأرقام وشرطات فقط.");
      return;
    }
    if (trimmedGroupCode && !trimmedGroupName) {
      setError("عند تحديد كود المجموعة يجب إدخال اسم المجموعة.");
      return;
    }
    if (!trimmedGroupCode && trimmedGroupName) {
      setError("اسم المجموعة يتطلب كود مجموعة.");
      return;
    }

    if (isCreate) {
      if (!gradeId || !grades.some((g) => g.id === gradeId)) {
        setError("الصف مطلوب ويجب اختياره من القائمة.");
        return;
      }
      if (!trimmedCode || !CODE_RE.test(trimmedCode)) {
        setError("كود المادة مطلوب بحروف لاتينية صغيرة وأرقام وشرطات فقط (مثل: arabic-g10-nahw).");
        return;
      }

      const slug = deriveSubjectSlug(trimmedCode);

      const payload = {
        name: trimmedName,
        code: trimmedCode,
        group_code: trimmedGroupCode || null,
        group_name: trimmedGroupCode ? trimmedGroupName : null,
        grade_id: gradeId,
        sort_order: sortOrder,
        icon: trimmedIcon || null,
        color: trimmedColor || null,
        curriculum_track_id: trackId || null,
        slug,
      };

      setSaving(true);
      const { error: insertError } = await supabase
        .from("subjects")
        .insert(payload);
      setSaving(false);

      if (insertError) {
        setError("تعذر إنشاء المادة.");
        toast.error("تعذر إنشاء المادة.");
        return;
      }

      toast.success("تم إنشاء المادة بنجاح.");
      await queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      onOpenChange(false);
      return;
    }

    if (!subject) return;

    const lockedGroupCode = (subject.group_code ?? "").trim().toLowerCase();
    if (lockedGroupCode && trimmedGroupCode !== lockedGroupCode) {
      setError("كود المجموعة غير قابل للتغيير بعد تعيينه.");
      return;
    }

    const payload = {
      name: trimmedName,
      sort_order: sortOrder,
      icon: trimmedIcon || null,
      color: trimmedColor || null,
      curriculum_track_id: trackId || null,
      group_code: trimmedGroupCode || null,
      group_name: trimmedGroupCode ? trimmedGroupName : null,
    };

    setSaving(true);
    const { error: updateError } = await supabase
      .from("subjects")
      .update(payload)
      .eq("id", subject.id);
    setSaving(false);

    if (updateError) {
      setError("تعذر تحديث المادة.");
      toast.error("تعذر تحديث المادة.");
      return;
    }

    toast.success("تم تحديث المادة بنجاح.");
    await queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        onOpenChange(o);
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isCreate ? "إضافة مادة جديدة" : "تعديل المادة"}
          </DialogTitle>
          <DialogDescription className="text-right">
            {isCreate
              ? "أدخل بيانات المادة الجديدة ثم اضغط حفظ."
              : "يمكنك تعديل البيانات الأساسية للمادة. لا يمكن تغيير الصف من هنا."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject-name">اسم المادة</Label>
            <Input
              id="subject-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-code">كود المادة (subject_code)</Label>
            <Input
              id="subject-code"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              disabled={saving || !isCreate}
              readOnly={!isCreate}
              dir="ltr"
              placeholder="arabic-g10-nahw"
            />
            <p className="text-xs text-muted-foreground">
              {isCreate
                ? "حروف لاتينية صغيرة وأرقام وشرطات فقط. يُحدَّد مرة واحدة ولا يمكن تغييره لاحقاً."
                : "كود المادة ثابت ولا يمكن تعديله."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject-group-code">كود المجموعة</Label>
              <Input
                id="subject-group-code"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                disabled={saving || (!isCreate && !!subject?.group_code)}
                readOnly={!isCreate && !!subject?.group_code}
                dir="ltr"
                placeholder="arabic-g10-aden"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-group-name">اسم المجموعة</Label>
              <Input
                id="subject-group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                disabled={saving || !groupCode.trim()}
                dir="rtl"
                placeholder="اللغة العربية"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            اتركهما فارغين للمواد غير المتفرعة. المجموعة للعرض فقط ولا تؤثر على الصلاحيات أو استهداف الأسئلة.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject-order">الترتيب</Label>
              <Input
                id="subject-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-color">اللون</Label>
              <div className="flex gap-2">
                <Input
                  id="subject-color"
                  type="color"
                  value={HEX_RE.test(color) ? color : "#0d7377"}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={saving}
                  className="w-14 p-1"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={saving}
                  dir="ltr"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-icon">الأيقونة</Label>
            <Input
              id="subject-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="BookOpen"
              disabled={saving}
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject-grade">الصف</Label>
              {isCreate ? (
                <select
                  id="subject-grade"
                  value={gradeId}
                  onChange={(e) => setGradeId(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">اختر الصف</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input id="subject-grade" value={gradeName} disabled dir="rtl" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-track">المسار</Label>
              <select
                id="subject-track"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">عام</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.track_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
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
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : isCreate ? (
              "حفظ"
            ) : (
              "حفظ التعديلات"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SubjectEditDialog;
