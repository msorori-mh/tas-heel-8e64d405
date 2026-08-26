/**
 * 18C2 — Android native delivery card.
 *
 * Reuses the whole 18C pipeline (secure route → verify → private cache) and
 * then hands the cached app-private file to the native viewer. The file never
 * leaves app-private storage and no external browser is involved.
 */

import { useCallback, useEffect, useState } from "react";
import { BookOpenText, Loader2, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openNativePdf } from "@/lib/pdf/native-pdf-viewer";
import { getEntry } from "@/lib/offline/pdf-cache";
import { rememberLastPage, resolveLessonFile } from "@/lib/offline/lesson-file-client";
import { formatBytes } from "@/lib/offline/network";
import type { PdfViewerProps } from "./PdfViewer";

export function NativePdfDelivery({
  resourceId,
  lessonId,
  subjectId,
  title,
  kind,
}: PdfViewerProps) {
  const [status, setStatus] = useState<"idle" | "preparing" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [lastPage, setLastPage] = useState(1);
  const [stale, setStale] = useState(false);

  const prepare = useCallback(async () => {
    setStatus("preparing");
    setProgress(null);
    try {
      const resolved = await resolveLessonFile({
        resourceId,
        lessonId,
        subjectId,
        kind,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      });
      const entry = await getEntry(resourceId);
      if (!entry?.localPath) throw new Error("no_local_copy");
      setLocalPath(entry.localPath);
      setLastPage(Math.max(1, resolved.lastOpenedPage || 1));
      setStale(resolved.stale);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [resourceId, lessonId, subjectId, kind]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  const open = async () => {
    if (!localPath) return;
    try {
      const result = await openNativePdf({
        localPath,
        resourceId,
        title,
        initialPage: lastPage,
      });
      const page = Math.max(1, result?.lastPage ?? lastPage);
      setLastPage(page);
      await rememberLastPage(resourceId, page);
    } catch {
      setStatus("error");
    }
  };

  return (
    <section
      dir="rtl"
      className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-card"
    >
      <h2 className="text-sm font-bold text-foreground">{title?.trim() || "ملف الدرس"}</h2>

      {status === "preparing" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {progress
            ? `جارٍ تجهيز الملف… ${formatBytes(progress.loaded)}${
                progress.total ? ` من ${formatBytes(progress.total)}` : ""
              }`
            : "جارٍ تجهيز الملف…"}
        </p>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            تعذّر تجهيز ملف الدرس. تحقق من الاتصال ثم أعد المحاولة.
          </p>
          <Button size="sm" onClick={() => void prepare()}>
            <RefreshCw className="ms-2 h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      )}

      {status === "ready" && (
        <div className="space-y-2">
          <Button size="sm" onClick={() => void open()}>
            <BookOpenText className="ms-2 h-4 w-4" />
            فتح الملف داخل التطبيق
          </Button>
          <p className="text-xs text-muted-foreground">
            {stale ? (
              <span className="flex items-center gap-1">
                <WifiOff className="h-3.5 w-3.5" /> نسخة محفوظة (بدون إنترنت)
              </span>
            ) : (
              `محفوظ للاستخدام دون إنترنت · آخر صفحة: ${lastPage}`
            )}
          </p>
        </div>
      )}
    </section>
  );
}

export default NativePdfDelivery;
