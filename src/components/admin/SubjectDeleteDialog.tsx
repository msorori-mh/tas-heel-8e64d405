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
  subject: { id: string; name: string } | null;
}

async function fetchCounts(subjectId: string) {
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
}

export function SubjectDeleteDialog({ open, onOpenChange, subject }: Props) {
  const queryClient = useQueryClient();
  const enabled = open && !!subject;
  const [deleting, setDeleting] = useState(false);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const countsQ = useQuery({
    enabled,
    queryKey: ["admin-subjects", "delete-counts", subject?.id],
    queryFn: () => fetchCounts(subject!.id),
  });

  const counts = countsQ.data;
  const isSafe =
    !!counts &&
    counts.units === 0 &&
    counts.lessons === 0 &&
    counts.questions === 0;

  const canDelete =
    enabled &&
    !countsQ.isLoading &&
    !countsQ.isFetching &&
    !countsQ.isError &&
    isSafe &&
    !deleting;

  const handleDelete = async () => {
    if (!subject || deleting) return;
    setBlockMsg(null);
    setDeleting(true);

    try {
      const fresh = await fetchCounts(subject.id);
      if (fresh.units > 0 || fresh.lessons > 0 || fresh.questions > 0) {
        setBlockMsg(
          "لا يمكن حذف هذه المادة لأنها تحتوي على وحدات أو دروس أو أسئلة مرتبطة."
        );
        await queryClient.invalidateQueries({
          queryKey: ["admin-subjects", "delete-counts", subject.id],
        });
        setDeleting(false);
        return;
      }

      const { error } = await supabase
        .from("subjects")
        .delete()
        .eq("id", subject.id);

      if (error) {
        toast.error("تعذر حذف المادة.");
        setBlockMsg("تعذر حذف المادة.");
        setDeleting(false);
        return;
      }

      toast.success("تم حذف المادة بنجاح.");
      await queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
      setDeleting(false);
      onOpenChange(false);
    } catch {
      toast.error("تعذر حذف المادة.");
      setBlockMsg("تعذر حذف المادة.");
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (deleting) return;
        if (!o) setBlockMsg(null);
        onOpenChange(o);
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            حذف المادة
          </DialogTitle>
          <DialogDescription className="text-right">
            مراجعة أثر الحذف قبل التنفيذ. هذا الإجراء لا يمكن التراجع عنه.
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
            لذلك لا يُسمح بالحذف إلا إذا كانت المادة فارغة تمامًا.
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
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="الوحدات" value={counts?.units ?? 0} />
                <Stat label="الدروس" value={counts?.lessons ?? 0} />
                <Stat label="الأسئلة" value={counts?.questions ?? 0} />
              </div>
              {!isSafe && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  لا يمكن حذف هذه المادة لأنها تحتوي على وحدات أو دروس أو أسئلة
                  مرتبطة.
                </div>
              )}
            </>
          )}

          {blockMsg && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {blockMsg}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            إلغاء
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحذف...
              </>
            ) : (
              "حذف المادة"
            )}
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
        danger
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-card"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-bold ${
          danger ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default SubjectDeleteDialog;
