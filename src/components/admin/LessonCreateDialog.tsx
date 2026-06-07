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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LessonCreateDialog({ open, onOpenChange }: Props) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [duration, setDuration] = useState("");
  const [isFree, setIsFree] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setSubjectId("");
      setUnitId("");
      setSortOrder(0);
      setDuration("");
      setIsFree(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة درس</DialogTitle>
          <DialogDescription>
            إنشاء درس جديد — الحفظ سيتم تفعيله في المرحلة التالية.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="create-title">عنوان الدرس</Label>
            <Input
              id="create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الدرس"
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
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
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
            <Label htmlFor="create-unit">الوحدة</Label>
            <select
              id="create-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!subjectId}
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-duration">المدة</Label>
            <Input
              id="create-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="مثال: 30 دقيقة"
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
                />
                باشتراك
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="create-access"
                  checked={isFree}
                  onChange={() => setIsFree(true)}
                />
                مجاني
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button disabled title="الحفظ في المرحلة التالية">
            الحفظ في المرحلة التالية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
