/**
 * 18C2 — web delivery using the browser's own PDF engine.
 *
 * Same cached bytes as everywhere else (18C pipeline), exposed to the built-in
 * viewer through a short-lived object URL. This path is only chosen when the
 * browser reports a native PDF viewer; otherwise pdf.js remains the fallback.
 */

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveLessonFile } from "@/lib/offline/lesson-file-client";
import type { PdfViewerProps } from "./PdfViewer";

export function BrowserNativePdfDelivery({
  resourceId,
  lessonId,
  subjectId,
  title,
  kind,
  className,
}: PdfViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const resolved = await resolveLessonFile({ resourceId, lessonId, subjectId, kind });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(resolved.blob);
        setUrl(objectUrl);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resourceId, lessonId, subjectId, reloadKey]);

  if (status === "error") {
    return (
      <section
        dir="rtl"
        className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-card"
      >
        <p className="text-muted-foreground">
          تعذّر فتح ملف الدرس. تحقق من الاتصال ثم أعد المحاولة.
        </p>
        <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw className="ms-2 h-4 w-4" />
          إعادة المحاولة
        </Button>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
    >
      <header className="border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-bold text-foreground">
          {title?.trim() || "ملف الدرس"}
        </h2>
      </header>
      {status === "loading" || !url ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          جارٍ تجهيز الملف…
        </p>
      ) : (
        <object
          data={url}
          type="application/pdf"
          className="h-[70vh] w-full"
          aria-label={title?.trim() || "ملف الدرس"}
        />
      )}
    </section>
  );
}

export default BrowserNativePdfDelivery;
