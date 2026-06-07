import { useEffect, useMemo, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LessonCreateDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [duration, setDuration] = useState("");
  const [isFree, setIsFree] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSubjectId("");
      setUnitId("");
      setSortOrder(0);
      setDuration("");
      setIsFree(false);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const subjectsQ = useQuery({
    enabled: open,
    queryKey: ["lesson-create", "subjects"],
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
    enabled: open,
    queryKey: ["lesson-create", "units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, title, subject_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredUnits = useMemo(() => {
    if (!subjectId) return [];
    return (unitsQ.data ?? []).filter((u: any) => u.subject_id === subjectId);
  }, [unitsQ.data, subjectId]);

  const subjectIds = useMemo(
    () => new Set((subjectsQ.data ?? []).map((s: any) => s.id)),
    [subjectsQ.data]
  );

  const unitIds = useMemo(
    () => new Set(filteredUnits.map((u: any) => u.id)),
    [filteredUnits]
  );

  async function handleSave() {
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("عنوان الدرس مطلوب.");
      return;
    }

    if (!subjectId) {
      setError("اختيار المادة مطلوب.");
      return;
    }
    if (!subjectIds.has(subjectId)) {
      setError("المادة المختارة غير موجودة.");
      return;
    }

    if (!unitId) {
      setError("اختيار الوحدة مطلوب.");
      return;
    }
    if (!unitIds.has(unitId)) {
      setError("الوحدة المختارة غير موجودة ضمن المادة.");
      return;
    }

    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError("الترتيب يجب أن يكون عددًا صحيحًا غير سالب.");
      return;
    }

    const trimmedDuration = duration.trim();
    const durationVal = trimmedDuration || null;

    const slugBase = trimmedTitle
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "lesson";
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      title: trimmedTitle,
      subject_id: subjectId,
      unit_id: unitId,
      sort_order: sortOrder,
      duration: durationVal,
      is_free: !!isFree,
      slug,
    };

    setSaving(true);
    const { error: insertError } = await supabase
      .from("lessons")
      .insert(payload);
    setSaving(false);

    if (insertError) {
      setError("تعذر إنشاء الدرس.");
      toast.error("تعذر إنشاء الدرس.");
      return;
    }

    toast.success("تم إنشاء الدرس بنجاح.");
    queryClient.invalidateQueries({ queryKey: ["admin-lessons"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!saving) onOpenChange(val); }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة درس</DialogTitle>
          <DialogDescription>
            إنشاء درس جديد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="create-title">عنوان الدرس</Label>
            <Input
              id="create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الدرس"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-subject">المادة</Label>
            <select
              id="create-subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setUnitId("");
              }}
              disabled={saving}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">اختر المادة…</option>
              {(subjectsQ.data ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-unit">الوحة</Label>
            <select
              id="create-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!subjectId || saving}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">
                {subjectId ? "اختر الوحدة…" : "اختر المادة أولاً"}
              </option>
              {filteredUnits.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-sort">الترتيب</Label>
            <Input
              id="create-sort"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-duration">المدة</Label>
            <Input
              id="create-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="مثال: 30 دقيقة"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>حالة الوصول</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="create-access"
                  checked={!isFree}
                  onChange={() => setIsFree(false)}
                  disabled={saving}
                />
                باشتراك
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="create-access"
                  checked={isFree}
                  onChange={() => setIsFree(true)}
                  disabled={saving}
                />
                مجاني
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
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
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الإنشاء...
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
