import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createLessonPdfUploadTarget,
  bindLessonPrimaryPdf,
  deleteLessonPrimaryPdf,
  getLessonPrimaryPdfState,
} from "@/lib/api/lesson-pdf.functions";
import {
  formatBytes,
  uploadLessonPrimaryPdf,
  validatePdfFile,
} from "@/lib/lessons/lesson-pdf-upload-client";

interface Props {
  lessonId: string;
  enabled: boolean;
}

export function LessonPrimaryPdfCard({ lessonId, enabled }: Props) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getLessonPrimaryPdfState);
  const createTarget = useServerFn(createLessonPdfUploadTarget);
  const bind = useServerFn(bindLessonPrimaryPdf);
  const removeFn = useServerFn(deleteLessonPrimaryPdf);

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({
    enabled,
    queryKey: ["admin-lesson-detail", "primary-pdf", lessonId],
    queryFn: async () => stateFn({ data: { lessonId } }),
  });

  const primary = q.data?.primary ?? null;

  const pick = (file: File | null) => {
    if (!file) return;
    const invalid = validatePdfFile(file);
    if (invalid) {
      toast.error(invalid);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setPending(file);
  };

  const doUpload = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await uploadLessonPrimaryPdf({ createTarget, bind }, lessonId, pending);
      toast.success(res.replaced ? "تم استبدال ملف الدرس الأساسي." : "تم رفع ملف الدرس الأساسي.");
      setPending(null);
      if (inputRef.current) inputRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["admin-lesson-detail"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الملف.");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await removeFn({ data: { lessonId } });
      toast.success("تم حذف الملف الأساسي.");
      setConfirmDelete(false);
      await qc.invalidateQueries({ queryKey: ["admin-lesson-detail"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حذف الملف.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
        </div>
      ) : primary ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <p className="text-sm font-medium text-foreground">
                {primary.fileName ?? primary.title}
              </p>
              <p className="text-muted-foreground">
                الحجم: {formatBytes(primary.fileSize)} · آخر تحديث:{" "}
                {primary.uploadedAt ? new Date(primary.uploadedAt).toLocaleString("ar") : "—"}
              </p>
              <p className="text-muted-foreground">
                الحالة: مرفوع على التخزين الخاص · جاهز للطالب ·{" "}
                {primary.managed ? "رفع مباشر" : "مورد قديم (رابط خارجي)"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <RefreshCw className="ms-1 h-3.5 w-3.5" />
              استبدال الملف الأساسي
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="ms-1 h-3.5 w-3.5" />
              حذف
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !busy && inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 text-center transition-colors hover:border-primary/60"
        >
          <Upload className="h-6 w-6 text-primary" />
          <span className="text-sm font-medium text-foreground">رفع ملف PDF الأساسي</span>
          <span className="text-[11px] text-muted-foreground">
            اختر ملف .pdf من جهازك — لا حاجة لأي رابط خارجي
          </span>
        </div>
      )}

      {pending && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <p className="font-medium text-foreground">{pending.name}</p>
          <p className="text-muted-foreground">{formatBytes(pending.size)}</p>
          {primary && (
            <p className="mt-2 flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              سيتم استبدال الملف الأساسي الحالي، وستُعتبر النسخة المخزنة على الأجهزة قديمة.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={doUpload} disabled={busy}>
              {busy && <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />}
              {primary ? "تأكيد الاستبدال" : "رفع وربط بالدرس"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPending(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      <Dialog open={confirmDelete} onOpenChange={(o) => (!busy ? setConfirmDelete(o) : null)}>
        <DialogContent dir="rtl" className="text-right">
          <DialogHeader>
            <DialogTitle className="text-right">حذف الملف الأساسي</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيصبح هذا الدرس غير جاهز للطالب إذا لم يوجد محتوى أساسي بديل.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
              تراجع
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy}>
              {busy && <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />}
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
