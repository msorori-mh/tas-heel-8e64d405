import { useQuery } from "@tanstack/react-query";
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
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: { id: string; name: string } | null;
}

export function SubjectDeleteDialog({ open, onOpenChange, subject }: Props) {
  const enabled = open && !!subject;

  const countsQ = useQuery({
    enabled,
    queryKey: ["admin-subjects", "delete-counts", subject?.id],
    queryFn: async () => {
      const subjectId = subject!.id;

      const unitsRes = await supabase
        .from("units")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", subjectId);
      if (unitsRes.error) throw unitsRes.error;

      const lessonsRes = await supabase
        .from("lessons")
        .select("id", { count: "exact" })
        .eq("subject_id", subjectId);
      if (lessonsRes.error) throw lessonsRes.error;

      const lessonIds = (lessonsRes.data ?? []).map((l) => l.id);

      const qBySubject = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", subjectId);
      if (qBySubject.error) throw qBySubject.error;

      let qByLesson = 0;
      if (lessonIds.length > 0) {
        const r = await supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .in("lesson_id", lessonIds)
          .is("subject_id", null);
        if (r.error) throw r.error;
        qByLesson = r.count ?? 0;
      }

      return {
        units: unitsRes.count ?? 0,
        lessons: lessonsRes.count ?? lessonIds.length,
        questions: (qBySubject.count ?? 0) + qByLesson,
      };
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            حذف المادة
          </DialogTitle>
          <DialogDescription className="text-right">
            مراجعة أثر الحذف قبل التنفيذ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div>
            <span className="text-muted-foreground">المادة: </span>
            <span className="font-medium text-foreground">
              {subject?.name ?? "—"}
            </span>
          </div>

          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            حذف المادة قد يؤدي إلى حذف الوحدات والدروس والأسئلة المرتبطة بها.
          </div>

          {countsQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري حساب الأثر…
            </div>
          ) : countsQ.isError ? (
            <div className="text-destructive text-xs">
              تعذر حساب أثر الحذف.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="الوحدات" value={countsQ.data?.units ?? 0} />
              <Stat label="الدروس" value={countsQ.data?.lessons ?? 0} />
              <Stat label="الأسئلة" value={countsQ.data?.questions ?? 0} />
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
  return (
    <div className="rounded-md border border-border bg-card p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

export default SubjectDeleteDialog;
