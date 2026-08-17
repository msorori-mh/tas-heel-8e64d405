/**
 * 21B — "كتب المنهج" sheet.
 *
 * Optional, student-initiated downloads only. Everything below the button
 * reuses the existing secure delivery route, offline cache and PDF renderers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CloudDownload,
  Loader2,
  RefreshCw,
  Trash2,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InAppPdfDelivery, prefetchPdfViewerChunk } from "@/components/lessons/InAppPdfDelivery";
import { formatBytes } from "@/lib/offline/network";
import {
  deleteLocalTextbook,
  downloadTextbook,
  listStudentTextbooks,
  readTextbookLocalState,
  BOOK_TYPE_LABEL,
  type StudentTextbook,
  type TextbookLocalState,
} from "@/lib/textbooks/subject-textbook-client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string;
  /** Full-year books show in both semesters; semester books only in theirs. */
  semester?: 1 | 2;
};

export function SubjectTextbooksSheet({
  open,
  onOpenChange,
  subjectId,
  subjectName,
  semester,
}: Props) {
  const { data, isLoading, error } = useQuery({
    enabled: open,
    queryKey: ["subject-textbooks", subjectId, semester ?? null],
    queryFn: () => listStudentTextbooks({ subjectId, semester: semester ?? null }),
  });

  const [reading, setReading] = useState<StudentTextbook | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader className="text-right">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            كتب المنهج — {subjectName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            التحميل اختياري. بعد التحميل يمكنك فتح الكتاب داخل التطبيق بدون إنترنت.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3 pb-6">
          {isLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل قائمة الكتب…
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive">تعذّر تحميل قائمة الكتب. حاول لاحقاً.</p>
          )}

          {data && data.length === 0 && (
            <p className="rounded-xl bg-muted/60 px-3 py-3 text-xs text-muted-foreground">
              لا توجد كتب منهج متاحة لهذه المادة حتى الآن.
            </p>
          )}

          {reading ? (
            <div className="space-y-2">
              <Button size="sm" variant="ghost" onClick={() => setReading(null)}>
                <X className="ms-2 h-4 w-4" /> إغلاق القارئ
              </Button>
              <InAppPdfDelivery
                resourceId={reading.id}
                subjectId={reading.subjectId}
                title={reading.title}
                kind="textbook"
              />
            </div>
          ) : (
            data?.map((book) => (
              <TextbookRow key={book.id} book={book} onOpen={() => setReading(book)} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TextbookRow({ book, onOpen }: { book: StudentTextbook; onOpen: () => void }) {
  const [local, setLocal] = useState<TextbookLocalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setLocal(await readTextbookLocalState(book));
  }, [book]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (local?.status === "READY") prefetchPdfViewerChunk();
  }, [local?.status]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setBusy(true);
    setFailed(false);
    prefetchPdfViewerChunk();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await downloadTextbook({
        textbook: book,
        signal: controller.signal,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      });
    } catch {
      setFailed(true);
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
      await refresh();
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteLocalTextbook(book.id);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const percent =
    progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : null;

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{book.title}</h3>
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {BOOK_TYPE_LABEL[book.bookType]}
          </span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {book.coverageType === "SEMESTER_SPECIFIC"
              ? `كتاب الفصل ${book.semester === 2 ? "الثاني" : "الأول"}`
              : "كتاب الفصلين"}{" "}
            · {formatBytes(book.fileSize)} · إصدار{" "}
            {book.version.slice(0, 6)}
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary">
          <BookOpen className="h-4 w-4" />
        </span>
      </div>

      {busy && (
        <div className="space-y-1">
          <Progress value={percent ?? 0} className="h-2" />
          <p className="text-[11px] text-muted-foreground">
            {percent !== null ? `${percent}%` : "جارٍ التنزيل…"}
            {progress ? ` · ${formatBytes(progress.loaded)}` : ""}
            <span className="inline-flex items-center gap-1 ps-2">
              <Wifi className="h-3 w-3" /> يُفضّل Wi-Fi
            </span>
          </p>
        </div>
      )}

      {failed && !busy && (
        <p className="text-[11px] text-destructive">تعذّر إكمال التنزيل. يمكنك إعادة المحاولة.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {busy ? (
          <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
            <X className="ms-2 h-4 w-4" /> إيقاف
          </Button>
        ) : local?.cached ? (
          <>
            <Button size="sm" onClick={onOpen}>
              <BookOpen className="ms-2 h-4 w-4" /> فتح
            </Button>
            {local.updateAvailable && (
              <Button size="sm" variant="outline" onClick={start}>
                <RefreshCw className="ms-2 h-4 w-4" /> تحديث
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={remove}>
              <Trash2 className="ms-2 h-4 w-4" /> حذف من الجهاز
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={start}>
              <CloudDownload className="ms-2 h-4 w-4" />
              {failed ? "إعادة المحاولة" : "تنزيل"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpen}>
              قراءة الآن
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

export default SubjectTextbooksSheet;
