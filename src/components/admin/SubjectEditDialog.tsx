import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCurriculumSubjectAdmin } from "@/lib/content-codes/content-codes.functions";

export type SubjectEditValue = {
  id: string;
  name: string;
  code: string | null;
  group_code: string | null;
  group_name: string | null;
  sort_order: number;
  icon: string | null;
  color: string | null;
  grade_id: string;
  track_ids: string[];
};

type Grade = { id: string; name: string | null };
type Track = { id: string; track_name: string | null; track_code?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  subject?: SubjectEditValue | null;
  grades: Grade[];
  tracks: Track[];
};

export function SubjectEditDialog({
  open,
  onOpenChange,
  mode = "edit",
  subject,
  grades,
  tracks,
}: Props) {
  const queryClient = useQueryClient();
  const saveSubject = useServerFn(saveCurriculumSubjectAdmin);
  const isCreate = mode === "create";
  const [name, setName] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState(0);
  const [icon, setIcon] = useState("BookOpen");
  const [color, setColor] = useState("#3b82f6");
  const [groupCode, setGroupCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setName("");
      setGradeId("");
      setTrackIds([]);
      setSortOrder(0);
      setIcon("BookOpen");
      setColor("#3b82f6");
      setGroupCode("");
      setGroupName("");
    } else {
      setName(subject?.name ?? "");
      setGradeId(subject?.grade_id ?? "");
      setTrackIds(subject?.track_ids ?? []);
      setSortOrder(subject?.sort_order ?? 0);
      setIcon(subject?.icon ?? "BookOpen");
      setColor(subject?.color ?? "#3b82f6");
      setGroupCode(subject?.group_code ?? "");
      setGroupName(subject?.group_name ?? "");
    }
    setError(null);
  }, [isCreate, open, subject]);

  const toggleTrack = (trackId: string) => {
    const wasAssigned = subject?.track_ids.includes(trackId) ?? false;
    if (!isCreate && wasAssigned && trackIds.includes(trackId)) {
      setError("إزالة مسار قائم تحتاج مراجعة أثر مستقلة. يمكن إضافة المسار الآخر من هنا.");
      return;
    }
    setError(null);
    setTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId],
    );
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError("اسم المادة مطلوب.");
      return;
    }
    if (!gradeId) {
      setError("الصف مطلوب ويجب اختياره من القائمة.");
      return;
    }
    if (trackIds.length < 1 || trackIds.length > 2) {
      setError("اختر منهج صنعاء أو منهج عدن أو كليهما.");
      return;
    }
    if ((groupCode.trim() === "") !== (groupName.trim() === "")) {
      setError("عند استخدام المجموعة يجب إدخال كود المجموعة واسمها معًا.");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveSubject({
        data: {
          subjectId: isCreate ? null : subject?.id ?? null,
          name: name.trim(),
          gradeId,
          trackIds,
          sortOrder,
          icon: icon.trim() || null,
          color,
          groupCode: groupCode.trim() || null,
          groupName: groupName.trim() || null,
        },
      });
      toast.success(
        isCreate
          ? `تم إنشاء المادة بالكود ${saved.code} وربطها بالمسار المحدد.`
          : "تم تحديث المادة وربط المسارات بنجاح.",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-curriculum"] });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المادة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent dir="rtl" className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isCreate ? "إضافة مادة" : "تعديل المادة"}
          </DialogTitle>
          <DialogDescription className="text-right">
            {isCreate
              ? "حدد الصف والمسار أو المسارين؛ ينشئ النظام كود TCS-2 تلقائيًا."
              : "الكود والصف ثابتان. يمكن تعديل الاسم أو إضافة المسار الآخر."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject-name">اسم المادة</Label>
            <Input
              id="subject-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>

          {!isCreate && (
            <div className="space-y-1.5">
              <Label>كود المادة</Label>
              <Input value={subject?.code ?? "بلا كود"} disabled dir="ltr" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="subject-grade">الصف</Label>
            <select
              id="subject-grade"
              value={gradeId}
              onChange={(event) => setGradeId(event.target.value)}
              disabled={saving || !isCreate}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">اختر الصف</option>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>{grade.name ?? "—"}</option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">المسار (اختيار متعدد)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {tracks.map((track) => (
                <label
                  key={track.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={trackIds.includes(track.id)}
                    onChange={() => toggleTrack(track.id)}
                    disabled={saving}
                    className="h-4 w-4 accent-primary"
                  />
                  {track.track_name ?? track.track_code ?? "مسار"}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              الكتاب أو المادة المشتركة يمكن ربطها بصنعاء وعدن في الوقت نفسه. خيار «آخر» غير مستخدم هنا.
            </p>
          </fieldset>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">خيارات متقدمة</summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subject-order">الترتيب</Label>
                  <Input
                    id="subject-order"
                    type="number"
                    min={0}
                    value={sortOrder}
                    onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subject-color">اللون</Label>
                  <Input
                    id="subject-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject-icon">الأيقونة</Label>
                <Input
                  id="subject-icon"
                  value={icon}
                  onChange={(event) => setIcon(event.target.value)}
                  disabled={saving}
                  dir="ltr"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subject-group-code">كود المجموعة</Label>
                  <Input
                    id="subject-group-code"
                    value={groupCode}
                    onChange={(event) => setGroupCode(event.target.value)}
                    disabled={saving || (!isCreate && Boolean(subject?.group_code))}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subject-group-name">اسم المجموعة</Label>
                  <Input
                    id="subject-group-name"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    disabled={saving || !groupCode.trim()}
                  />
                </div>
              </div>
            </div>
          </details>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "جاري الحفظ…" : isCreate ? "إنشاء المادة" : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SubjectEditDialog;
