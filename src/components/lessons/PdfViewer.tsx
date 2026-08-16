/**
 * 18C-2 — in-app PDF viewer.
 *
 * Renders one page at a time (never rasterises the whole document), reads the
 * bytes from the offline cache first, and keeps the student inside تمكين.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rememberLastPage, resolveLessonFile } from "@/lib/offline/lesson-file-client";
import { formatBytes } from "@/lib/offline/network";

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

export type PdfViewerProps = {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  title?: string | null;
  /** Fallback link shown only when in-app delivery fails entirely. */
  fallbackUrl?: string | null;
  className?: string;
};

export function PdfViewer({
  resourceId,
  lessonId,
  subjectId,
  title,
  fallbackUrl,
  className,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [fullscreen, setFullscreen] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [staleCopy, setStaleCopy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /* Load bytes → pdf document */
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorCode(null);
    setProgress(null);

    (async () => {
      try {
        const resolved = await resolveLessonFile({
          resourceId,
          lessonId,
          subjectId,
          onProgress: (loaded, total) => {
            if (!cancelled) setProgress({ loaded, total });
          },
        });
        if (cancelled) return;
        setOfflineCopy(true);
        setStaleCopy(resolved.stale);

        const pdfjs = await loadPdfJs();
        const buffer = await resolved.blob.arrayBuffer();
        if (cancelled) return;
        const doc = (await pdfjs.getDocument({ data: new Uint8Array(buffer) })
          .promise) as unknown as PdfDocument;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage(Math.min(Math.max(1, resolved.lastOpenedPage), doc.numPages));
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorCode(err instanceof Error ? err.message : "unknown_error");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy();
    };
  }, [resourceId, lessonId, subjectId, reloadKey]);

  /* Render the current page only */
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || status !== "ready") return;

    renderTaskRef.current?.cancel();
    const pdfPage = await doc.getPage(page);
    const containerWidth = containerRef.current?.clientWidth ?? 360;
    const base = pdfPage.getViewport({ scale: 1 });
    const fitScale = Math.min(2, (containerWidth - 8) / base.width);
    const viewport = pdfPage.getViewport({ scale: fitScale * scale });

    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = pdfPage.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      /* superseded render */
    }
  }, [page, scale, status]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  useEffect(() => {
    if (status === "ready") void rememberLastPage(resourceId, page);
  }, [resourceId, page, status]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(numPages || 1, p + 1));

  if (status === "error") {
    return (
      <section
        dir="rtl"
        className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-card"
      >
        <p className="font-medium text-foreground">تعذّر فتح ملف الدرس داخل التطبيق</p>
        <p className="text-muted-foreground">
          {errorCode?.includes("401") || errorCode === "unauthenticated"
            ? "انتهت الجلسة. سجّل الدخول مرة أخرى ثم أعد المحاولة."
            : errorCode?.includes("403")
              ? "هذا الدرس غير متاح لمنهجك أو صفك الدراسي."
              : "تحقق من اتصالك بالإنترنت ثم أعد المحاولة."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="ms-2 h-4 w-4" />
            إعادة المحاولة
          </Button>
          {fallbackUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                فتح الملف خارج التطبيق
              </a>
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card",
        fullscreen && "fixed inset-0 z-50 rounded-none border-0",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
          {title?.trim() || "ملف الدرس"}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {numPages ? `صفحة ${page} من ${numPages}` : "…"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </header>

      <div
        ref={containerRef}
        className={cn(
          "relative grid min-h-80 place-items-center overflow-auto bg-muted/40 p-1",
          fullscreen ? "flex-1" : "max-h-[70vh]",
        )}
      >
        {status === "loading" && (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>
              {progress
                ? `جارٍ تنزيل الملف… ${formatBytes(progress.loaded)}${
                    progress.total ? ` من ${formatBytes(progress.total)}` : ""
                  }`
                : "جارٍ تجهيز الملف…"}
            </span>
          </div>
        )}
        <canvas ref={canvasRef} className={cn(status !== "ready" && "hidden", "shadow-sm")} />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={goPrev}
            disabled={page <= 1}
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={goNext}
            disabled={!numPages || page >= numPages}
            aria-label="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, Number((s - 0.15).toFixed(2))))}
            aria-label="تصغير"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, Number((s + 0.15).toFixed(2))))}
            aria-label="تكبير"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {staleCopy ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              نسخة محفوظة (بدون إنترنت)
            </>
          ) : offlineCopy && status === "ready" ? (
            <>
              <Download className="h-3.5 w-3.5 text-primary" />
              محفوظ للاستخدام دون إنترنت
            </>
          ) : null}
        </p>
      </footer>
    </section>
  );
}

export default PdfViewer;
