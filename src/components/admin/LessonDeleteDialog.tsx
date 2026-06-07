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
  lesson:
    | {
        id: string;
        title: string;
        subject_name: string | null;
        unit_name: string | null;
      }
    | null;
}

type Counts = {
  questions: number;
  books: number;
  summaries: number;
  explanations: number;
  resources: number;
  simulations: number;
  hasVideo: boolean;
  hasPdf: boolean;
};

async function fetchLessonCounts(lessonId: string): Promise<Counts> {
  const countIn = async (
    table:
      | "questions"
      | "lesson_book_contents"
      | "lesson_summaries"
      | "lesson_explanations"
      | "lesson_resources"
      | "lesson_simulations"
  ) => {
    const r = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId);
    if (r.error) throw r.error;
    return r.count ?? 0;
  };

  const videoExistsRes = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("id", lessonId)
    .not("video_url", "is", null);
  if (videoExistsRes.error) throw videoExistsRes.error;

  const pdfExistsRes = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("id", lessonId)
    .not("content_pdf_url", "is", null);
  if (pdfExistsRes.error) throw pdfExistsRes.error;

  const [questions, books, summaries, explanations, resources, simulations] =
    await Promise.all([
      countIn("questions"),
      countIn("lesson_book_contents"),
      countIn("lesson_summaries"),
      countIn("lesson_explanations"),
      countIn("lesson_resources"),
      countIn("lesson_simulations"),
    ]);

  return {
    questions,
    books,
    summaries,
    explanations,
    resources,
    simulations,
    hasVideo: (videoExistsRes.count ?? 0) > 0,
    hasPdf: (pdfExistsRes.count ?? 0) > 0,
  };
}

function isSafeToDelete(c: Counts) {
  return (
    c.questions === 0 &&
    c.books === 0 &&
    c.summaries === 0 &&
    c.explanations === 0 &&
    c.resources === 0 &&
    c.simulations === 0 &&
    !c.hasVideo &&
    !c.hasPdf
  );
}

export function LessonDeleteDialog({ open, onOpenChange, lesson }: Props) {
  const queryClient = useQueryClient();
  const enabled = open && !!lesson;
  const [deleting, setDeleting] = useState(false);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const countsQ = useQuery({
    enabled,
    queryKey: ["admin-lessons", "delete-counts", lesson?.id],
    queryFn: () => fetchLessonCounts(lesson!.id),
  });

  const c = countsQ.data;
  const safe = !!c && isSafeToDelete(c);

  const canDelete =
    enabled &&
    !countsQ.isLoading &&
    !countsQ.isFetching &&
    !countsQ.isError &&
    safe &&
    !deleting;

  const handleDelete = async () => {
    if (!lesson || deleting) return;
    setBlockMsg(null);
    setDeleting(true);
    try {
      const fresh = await fetchLessonCounts(lesson.id);
      if (!isSafeToDelete(fresh)) {
        setBlockMsg(
          "لا يمكن حذف هذا الدرس لأنه يحتوي على محتوى أو أسئلة أو ملفات مرتبطة."
        );
        await queryClient.invalidateQueries({
          queryKey: ["admin-lessons", "delete-counts", lesson.id],
        });
        setDeleting(false);
        return;
      }

      const { error } = await supabase
        .from("lessons")
        .delete()
        .eq("id", lesson.id);
      if (error) {
        toast.error("تعذر حذف الدرس.");
        setBlockMsg("تعذر حذف الدرس.");
        setDeleting(false);
        return;
      }

      toast.success("تم حذف الدرس بنجاح.");
      await queryClient.invalidateQueries({ queryKey: ["admin-lessons"] });
      setDeleting(false);
      onOpenChange(false);
    } catch {
      toast.error("تعذر حذف الدرس.");
      setBlockMsg("تعذر حذف الدرس.");
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
      <DialogContent dir="rtl" className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            حذف الدرس
          </DialogTitle>
          <DialogDescription className="text-right">
            مراجعة أثر الحذف قبل التنفيذ. هذا الإجراء لا يمكن التراجع عنه.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div>
            <span className="text-muted-foreground">الدرس: </span>
            <span className="font-medium text-foreground">{lesson?.title ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">المادة: </span>
            <span className="font-medium text-foreground">{lesson?.subject_name ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">الوحدة: </span>
            <span className="font-medium text-foreground">{lesson?.unit_name ?? "—"}</span>
          </div>

          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            حذف الدرس قد يؤدي إلى حذف الأسئلة والمحتوى والموارد المرتبطة به.
            لذلك لا يُسمح بالحذف إلا إذا كان الدرس فارغًا تمامًا.
          </div>

          {countsQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري حساب الأثر…
            </div>
          ) : countsQ.isError ? (
            <div className="text-destructive text-xs">تعذر حساب أثر الحذف.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="الأسئلة" value={c?.questions ?? 0} />
                <Stat label="محتوى الكتاب" value={c?.books ?? 0} />
                <Stat label="الملخصات" value={c?.summaries ?? 0} />
                <Stat label="الشروحات" value={c?.explanations ?? 0} />
                <Stat label="الموارد" value={c?.resources ?? 0} />
                <Stat label="المحاكاة" value={c?.simulations ?? 0} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <BoolStat label="فيديو" on={!!c?.hasVideo} />
                <BoolStat label="ملف PDF" on={!!c?.hasPdf} />
              </div>
              {!safe && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  لا يمكن حذف هذا الدرس لأنه يحتوي على محتوى أو أسئلة أو ملفات مرتبطة.
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
              "حذف الدرس"
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

function BoolStat({ label, on }: { label: string; on: boolean }) {
  return (
    <div
      className={`rounded-md border p-2 text-center ${
        on ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${on ? "text-destructive" : "text-foreground"}`}>
        {on ? "نعم" : "لا"}
      </div>
    </div>
  );
}

export default LessonDeleteDialog;
