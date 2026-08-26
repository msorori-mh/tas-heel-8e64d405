/**
 * 21B — "كتب المنهج" sheet.
 * 21B4D — download & open UX: one explicit state machine shared between the
 * sheet, InAppPdfDelivery, reader-runtime and the local textbook registry.
 *
 * States: NOT_DOWNLOADED → DOWNLOADING → PDF_READY(+preparing|failed) →
 *         OFFLINE_READY ("محفوظ للاستخدام دون إنترنت" + "فتح الكتاب").
 *
 * Optional, student-initiated downloads only. Deleting only ever removes the
 * local copy (file + registry entry); nothing is deleted from the curriculum.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  CloudDownload,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InAppPdfDelivery, prefetchPdfViewerChunk } from "@/components/lessons/InAppPdfDelivery";
import { ensureReaderReady, isReaderReady } from "@/lib/pdf/reader-runtime";
import { markLocalTextbookOfflineReady } from "@/lib/offline/local-textbook-registry";
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

/** 21B4D — student-facing error copy. Never surface a technical exception. */
export const TEXTBOOK_UX_MESSAGES = {
  downloadFailed: "تعذر تنزيل الكتاب. تحقق من الاتصال وحاول مرة أخرى.",
  readerFailed: "تم حفظ الكتاب، لكن تعذر تجهيز القارئ للاستخدام دون إنترنت.",
  localMissing: "النسخة المحفوظة غير مكتملة. أعد تنزيل الكتاب.",
  openFailed: "تعذر فتح الكتاب حالياً.",
} as const;

export type TextbookUxState =
  | "NOT_DOWNLOADED"
  | "DOWNLOADING"
  | "PREPARING_READER"
  | "READER_NOT_READY"
  | "OFFLINE_READY";

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

  // 21B3 — start warming the reader runtime as soon as the sheet opens.
  useEffect(() => {
    if (open) prefetchPdfViewerChunk();
  }, [open]);

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
              <TextbookRow
                key={book.id}
                book={book}
                subjectLabel={subjectName}
                onOpen={() => setReading(book)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function coverageLabel(book: StudentTextbook): string {
  return book.coverageType === "SEMESTER_SPECIFIC"
    ? `الفصل ${book.semester === 2 ? "الثاني" : "الأول"}`
    : "العام الدراسي كامل";
}

function TextbookRow({
  book,
  subjectLabel,
  onOpen,
}: {
  book: StudentTextbook;
  subjectLabel: string;
  onOpen: () => void;
}) {
  const [local, setLocal] = useState<TextbookLocalState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** 21B3 — READER_READY is independent of PDF_READY. */
  const [readerReady, setReaderReady] = useState(false);
  const [readerBusy, setReaderBusy] = useState(false);
  const [readerFailed, setReaderFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setLocal(await readTextbookLocalState(book));
  }, [book]);

  const prepareReader = useCallback(async () => {
    setReaderBusy(true);
    setReaderFailed(false);
    try {
      const ready = await ensureReaderReady();
      setReaderReady(ready);
      if (!ready) {
        setReaderFailed(true);
        setMessage(TEXTBOOK_UX_MESSAGES.readerFailed);
      }
      // 21B4-B — keep the offline registry's OFFLINE_READY flag in sync.
      await markLocalTextbookOfflineReady(book.id, ready);
    } finally {
      setReaderBusy(false);
    }
  }, [book.id]);

  useEffect(() => {
    void refresh();
    setReaderReady(isReaderReady());
  }, [refresh]);

  // Whenever the bytes exist locally, make sure the reader runtime exists too.
  useEffect(() => {
    if (local?.cached && !readerReady && !readerBusy && !readerFailed) void prepareReader();
  }, [local?.cached, readerReady, readerBusy, readerFailed, prepareReader]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setDownloading(true);
    setMessage(null);
    void prepareReader();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await downloadTextbook({
        textbook: book,
        signal: controller.signal,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
        subjectLabel,
      });
    } catch {
      setMessage(TEXTBOOK_UX_MESSAGES.downloadFailed);
    } finally {
      abortRef.current = null;
      setDownloading(false);
      setProgress(null);
      await refresh();
    }
  };

  /** Delete the local copy only — never the curriculum book itself. */
  const remove = async () => {
    setConfirmRemove(false);
    try {
      await deleteLocalTextbook(book.id);
      setMessage(null);
    } finally {
      await refresh();
    }
  };

  const openBook = async () => {
    // Guard against a cache entry that vanished after the last render.
    const state = await readTextbookLocalState(book);
    setLocal(state);
    if (local?.cached && !state.cached) {
      setMessage(TEXTBOOK_UX_MESSAGES.localMissing);
      return;
    }
    try {
      onOpen();
    } catch {
      setMessage(TEXTBOOK_UX_MESSAGES.openFailed);
    }
  };

  const percent =
    progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : null;

  const pdfReady = Boolean(local?.cached);
  const offlineReady = pdfReady && readerReady;

  const state: TextbookUxState = useMemo(() => {
    if (downloading) return "DOWNLOADING";
    if (!pdfReady) return "NOT_DOWNLOADED";
    if (offlineReady) return "OFFLINE_READY";
    if (readerBusy) return "PREPARING_READER";
    return "READER_NOT_READY";
  }, [downloading, pdfReady, offlineReady, readerBusy]);

  return (
    <section className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-bold leading-6 text-foreground">{book.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {BOOK_TYPE_LABEL[book.bookType]}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {coverageLabel(book)}
            </span>
          </div>
        </div>

        {state !== "NOT_DOWNLOADED" && !downloading && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                aria-label={`خيارات إضافية لكتاب ${book.title}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="text-right">
              {local?.updateAvailable && (
                <DropdownMenuItem onSelect={() => void start()}>
                  <RefreshCw className="ms-2 h-4 w-4" /> تحديث النسخة
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmRemove(true)}
              >
                <Trash2 className="ms-2 h-4 w-4" /> إزالة التنزيل
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {state === "DOWNLOADING" && (
        <div className="space-y-1" aria-live="polite">
          <Progress value={percent ?? 0} className="h-2" />
          <p className="text-[11px] text-muted-foreground">
            {percent !== null ? `جارٍ التنزيل… ${percent}%` : "جارٍ التنزيل…"}
            {progress ? ` · ${formatBytes(progress.loaded)}` : ""}
            <span className="inline-flex items-center gap-1 ps-2">
              <Wifi className="h-3 w-3" /> يُفضّل Wi-Fi
            </span>
          </p>
        </div>
      )}

      {state !== "DOWNLOADING" && state !== "NOT_DOWNLOADED" && (
        <p
          aria-live="polite"
          className={`flex items-center gap-1 text-[11px] ${
            offlineReady ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {state === "OFFLINE_READY" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> محفوظ للاستخدام دون إنترنت
            </>
          ) : state === "PREPARING_READER" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> تم حفظ الملف · جارٍ تجهيز القارئ…
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" /> الملف محفوظ · يحتاج تجهيز القارئ
            </>
          )}
        </p>
      )}

      {message && (
        <p role="alert" className="text-[11px] text-destructive">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {state === "DOWNLOADING" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-10 min-w-[7.5rem]"
            onClick={() => abortRef.current?.abort()}
          >
            <X className="ms-2 h-4 w-4" /> إيقاف التنزيل
          </Button>
        ) : state === "NOT_DOWNLOADED" ? (
          <>
            <Button size="sm" className="h-10 min-w-[7.5rem]" onClick={() => void start()}>
              <CloudDownload className="ms-2 h-4 w-4" />
              {message ? "إعادة المحاولة" : "تنزيل"}
            </Button>
            <Button size="sm" variant="ghost" className="h-10" onClick={() => void openBook()}>
              قراءة الآن
            </Button>
          </>
        ) : state === "READER_NOT_READY" ? (
          <>
            <Button size="sm" className="h-10 min-w-[7.5rem]" onClick={() => void prepareReader()}>
              <RefreshCw className="ms-2 h-4 w-4" /> تجهيز القارئ
            </Button>
            <Button size="sm" variant="outline" className="h-10" onClick={() => void openBook()}>
              <BookOpen className="ms-2 h-4 w-4" /> فتح الكتاب
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-10 min-w-[9rem]" onClick={() => void openBook()}>
            <BookOpen className="ms-2 h-4 w-4" /> فتح الكتاب
          </Button>
        )}
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>إزالة التنزيل</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف النسخة المحفوظة من هذا الجهاز فقط، ويمكنك تنزيلها مرة أخرى لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction onClick={() => void remove()}>إزالة التنزيل</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default SubjectTextbooksSheet;
