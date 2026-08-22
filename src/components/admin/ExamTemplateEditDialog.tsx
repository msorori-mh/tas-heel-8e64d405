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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type ExamTemplateValue = {
  id: string;
  title: string;
  description: string | null;
  mode: "training" | "strict" | "ministry";
  subject_id: string | null;
  unit_id: string | null;
  lesson_id: string | null;
  duration_seconds: number | null;
  is_active: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  template?: ExamTemplateValue | null;
}

const MODES: { value: ExamTemplateValue["mode"]; label: string }[] = [
  { value: "training", label: "تدريب" },
  { value: "strict", label: "اختبار جاد" },
  { value: "ministry", label: "محاكي وزاري" },
];

export function ExamTemplateEditDialog({ open, onOpenChange, mode, template }: Props) {
  const queryClient = useQueryClient();
  const isCreate = mode === "create";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [examMode, setExamMode] = useState<ExamTemplateValue["mode"]>("training");
  const [subjectId, setSubjectId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [lessonId, setLessonId] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectsQ = useQuery({
    enabled: open,
    queryKey: ["admin-templates-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unitsQ = useQuery({
    enabled: open && !!subjectId,
    queryKey: ["admin-templates-units", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, title, subject_id")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const lessonsQ = useQuery({
    enabled: open && !!subjectId,
    queryKey: ["admin-templates-lessons", subjectId, unitId || "direct"],
    queryFn: async () => {
      let query = supabase
        .from("lessons")
        .select("id, title, unit_id")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true });
      query = unitId ? query.eq("unit_id", unitId) : query.is("unit_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setTitle("");
      setDescription("");
      setExamMode("training");
      setSubjectId("");
      setUnitId("");
      setLessonId("");
      setDuration("");
      setIsActive(true);
    } else if (template) {
      setTitle(template.title);
      setDescription(template.description ?? "");
      setExamMode(template.mode);
      setSubjectId(template.subject_id ?? "");
      setUnitId(template.unit_id ?? "");
      setLessonId(template.lesson_id ?? "");
      setDuration(template.duration_seconds != null ? String(template.duration_seconds) : "");
      setIsActive(template.is_active);
    }
    setError(null);
    setSaving(false);
  }, [open, isCreate, template]);

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("عنوان القالب مطلوب.");
      return;
    }

    let durationVal: number | null = null;
    if (duration.trim() !== "") {
      const n = Number(duration);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        setError("المدة يجب أن تكون عددًا صحيحًا أكبر من صفر.");
        return;
      }
      durationVal = n;
    }

    const payload = {
      title: trimmedTitle,
      description: description.trim() || null,
      mode: examMode,
      subject_id: subjectId || null,
      unit_id: unitId || null,
      lesson_id: lessonId || null,
      duration_seconds: durationVal,
    };

    setSaving(true);
    if (isCreate) {
      const { error: insertError } = await supabase
        .from("exam_templates")
        .insert(payload);
      setSaving(false);
      if (insertError) {
        setError("تعذر إنشاء القالب.");
        toast.error("تعذر إنشاء القالب.");
        return;
      }
      toast.success("تم إنشاء القالب بنجاح.");
    } else {
      if (!template) return;
      const { error: updateError } = await supabase
        .from("exam_templates")
        .update({ ...payload, is_active: isActive })
        .eq("id", template.id);
      setSaving(false);
      if (updateError) {
        setError("تعذر تحديث القالب.");
        toast.error("تعذر تحديث القالب.");
        return;
      }
      toast.success("تم تحديث القالب بنجاح.");
    }

    await queryClient.invalidateQueries({ queryKey: ["admin-exam-templates"] });
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
      <DialogContent dir="rtl" className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isCreate ? "إنشاء قالب اختبار" : "تعديل قالب الاختبار"}
          </DialogTitle>
          <DialogDescription className="text-right">
            أدخل بيانات القالب. يمكنك إدارة الأسئلة لاحقًا.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-title">العنوان</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              dir="rtl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">الوصف</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              dir="rtl"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-mode">النوع</Label>
              <select
                id="tpl-mode"
                value={examMode}
                onChange={(e) => setExamMode(e.target.value as ExamTemplateValue["mode"])}
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-duration">المدة (ثانية)</Label>
              <Input
                id="tpl-duration"
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={saving}
                placeholder="اختياري"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-subject">المادة</Label>
            <select
              id="tpl-subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setUnitId("");
                setLessonId("");
              }}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">— غير محدد —</option>
              {(subjectsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-unit">الوحدة (اختياري)</Label>
              <select
                id="tpl-unit"
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  setLessonId("");
                }}
                disabled={saving || !subjectId}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">— غير محدد —</option>
                {(unitsQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-lesson">الدرس</Label>
              <select
                id="tpl-lesson"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                disabled={saving || !subjectId}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">— غير محدد —</option>
                {(lessonsQ.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>
          </div>

          {!isCreate && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <span>القالب مفعّل</span>
            </label>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : isCreate ? "إنشاء" : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExamTemplateEditDialog;
