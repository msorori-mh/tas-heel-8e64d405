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

export type SubjectEditValue = {
  id: string;
  name: string;
  sort_order: number;
  icon: string | null;
  color: string | null;
  curriculum_track_id: string | null;
  grade_id: string;
};

type GradeOption = { id: string; name: string | null };
type TrackOption = { id: string; track_name: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: SubjectEditValue | null;
  grades: GradeOption[];
  tracks: TrackOption[];
}

export function SubjectEditDialog({ open, onOpenChange, subject, grades, tracks }: Props) {
  // Local-only form state — never persisted in this phase.
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [trackId, setTrackId] = useState<string>("");

  useEffect(() => {
    if (open && subject) {
      setName(subject.name ?? "");
      setSortOrder(subject.sort_order ?? 0);
      setIcon(subject.icon ?? "");
      setColor(subject.color ?? "#3b82f6");
      setTrackId(subject.curriculum_track_id ?? "");
    }
  }, [open, subject]);

  if (!subject) return null;

  const gradeName = grades.find((g) => g.id === subject.grade_id)?.name ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-right">تعديل المادة</DialogTitle>
          <DialogDescription className="text-right">
            معاينة نموذج التعديل. الحفظ غير مفعّل في هذه المرحلة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject-name">اسم المادة</Label>
            <Input
              id="subject-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              dir="rtl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject-order">الترتيب</Label>
              <Input
                id="subject-order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-color">اللون</Label>
              <div className="flex gap-2">
                <Input
                  id="subject-color"
                  type="color"
                  value={color || "#3b82f6"}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-14 p-1"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
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
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject-grade">الصف</Label>
              <Input id="subject-grade" value={gradeName} disabled dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-track">المسار</Label>
              <select
                id="subject-track"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
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
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button
            disabled
            title="الحفظ سيتوفر في المرحلة التالية"
            aria-disabled
          >
            الحفظ في المرحلة التالية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SubjectEditDialog;
