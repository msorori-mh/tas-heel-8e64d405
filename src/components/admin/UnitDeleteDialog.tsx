import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: { id: string; title: string; subject_name: string | null } | null;
}

async function fetchUnitCounts(unitId: string) {
  const lessonsRes = await supabase
    .from("lessons")
    .select("id")
    .eq("unit_id", unitId);
  if (lessonsRes.error) throw lessonsRes.error;
  const lessonIds = (lessonsRes.data ?? []).map((l) => l.id);

  const countIn = async (table: "questions" | "lesson_book_contents" | "lesson_summaries" | "lesson_resources" | "lesson_simulations") => {
    if (lessonIds.length === 0) return 0;
    const r = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("lesson_id", lessonIds);
    if (r.error) throw r.error;
    return r.count ?? 0;
  };

  const [questions, books, summaries, resources, simulations] = await Promise.all([
    countIn("questions"),
    countIn("lesson_book_contents"),
    countIn("lesson_summaries"),
    countIn("lesson_resources"),
    countIn("lesson_simulations"),
  ]);

  return {
    lessons: lessonIds.length,
    questions,
    books,
    summaries,
    resources,
    simulations,
  };
}

export function UnitDeleteDialog({ open, onOpenChange, unit }: Props) {
  const enabled = open && !!unit;
  const countsQ = useQuery({
    enabled,
    queryKey: ["admin-units", "delete-counts", unit?.id],
    queryFn: () => fetchUnitCounts(unit!.id),
  });

  const c = countsQ.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            حذف الوحدة
          </DialogTitle>
          <DialogDescription className="text-right">
            مراجعة أثر الحذف قبل التنفيذ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div>
            <span className="text-muted-foreground">الوحدة: </span>
            <span className="font-medium text-foreground">{unit?.title ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">المادة: </span>
            <span className="font-medium text-foreground">{unit?.subject_name ?? "—"}</span>
          </div>

          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            حذف الوحدة قد يؤدي إلى حذف الدروس والأسئلة والمحتوى المرتبط بها.
          </div>

          {countsQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري حساب الأثر…
            </div>
          ) : countsQ.isError ? (
            <div className="text-destructive text-xs">تعذر حساب أثر الحذف.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="الدروس" value={c?.lessons ?? 0} />
              <Stat label="الأسئلة" value={c?.questions ?? 0} />
              <Stat label="محتوى الكتاب" value={c?.books ?? 0} />
              <Stat label="الملخصات" value={c?.summaries ?? 0} />
              <Stat label="الموارد" value={c?.resources ?? 0} />
              <Stat label="المحاكاة" value={c?.simulations ?? 0} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button variant="destructive" disabled>
            الحذف في المرحلة التالية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const danger = value > 0;
  return (
    <div
      className={`rounded-md border p-2 text-center ${
        danger ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${danger ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

export default UnitDeleteDialog;
