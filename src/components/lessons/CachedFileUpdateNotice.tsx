import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDataSaver } from "@/hooks/use-data-saver";
import { beginBackgroundTransfer, withForegroundTransfer } from "@/lib/offline/download-priority";
import { getEntry } from "@/lib/offline/pdf-cache";
import {
  downloadAndCache,
  fetchFileMeta,
  type SecureFileKind,
} from "@/lib/offline/lesson-file-client";
import { formatBytes } from "@/lib/offline/network";

/** Updates never block opening local bytes or silently replace an open file. */
export function CachedFileUpdateNotice({
  resourceId,
  lessonId,
  subjectId,
  kind = "lesson",
  onUpdated,
  onDownloadStateChange,
}: {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  kind?: SecureFileKind;
  onUpdated: () => void;
  onDownloadStateChange?: (active: boolean) => void;
}) {
  const dataSaver = useDataSaver();
  const [status, setStatus] = useState<
    "idle" | "checking" | "available" | "current" | "downloading" | "error"
  >("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const manuallyRequested = useRef(false);
  const active = useRef<{ controller: AbortController; automatic: boolean } | null>(null);

  const check = useCallback(
    async (automatic: boolean) => {
      if (automatic && (active.current || manuallyRequested.current)) return;
      if (!automatic) manuallyRequested.current = true;
      active.current?.controller.abort();
      const controller = new AbortController();
      active.current = { controller, automatic };
      let release: (() => void) | undefined;
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const cached = await getEntry(resourceId);
        controller.signal.throwIfAborted();
        if (!cached || (automatic && Date.now() - cached.downloadedAt < 5 * 60_000)) return;
        let signal = controller.signal;
        if (automatic) {
          const lease = beginBackgroundTransfer(signal);
          if (!lease) return;
          signal = lease.signal;
          release = lease.release;
        }
        setStatus("checking");
        const work = () => fetchFileMeta(resourceId, kind, signal);
        const latest = automatic ? await work() : await withForegroundTransfer(work);
        signal.throwIfAborted();
        if (active.current?.controller !== controller || controller.signal.aborted) return;
        setSize(latest.size);
        setStatus(latest.version !== cached.downloadedVersion ? "available" : "current");
      } catch {
        if (active.current?.controller === controller) setStatus(automatic ? "idle" : "error");
      } finally {
        clearTimeout(timer);
        release?.();
        if (active.current?.controller === controller) active.current = null;
      }
    },
    [resourceId, kind],
  );

  useEffect(
    () => () => {
      active.current?.controller.abort();
      active.current = null;
    },
    [resourceId, kind],
  );
  useEffect(() => {
    if (dataSaver) return;
    const timer = setTimeout(() => {
      void check(true);
    }, 1500);
    return () => {
      clearTimeout(timer);
      if (active.current?.automatic) {
        active.current.controller.abort();
        active.current = null;
        setStatus((current) => (current === "checking" ? "idle" : current));
      }
    };
  }, [dataSaver, check]);

  const update = async () => {
    manuallyRequested.current = true;
    active.current?.controller.abort();
    const controller = new AbortController();
    active.current = { controller, automatic: false };
    setStatus("downloading");
    onDownloadStateChange?.(true);
    setProgress(null);
    try {
      await downloadAndCache({
        resourceId,
        lessonId,
        subjectId,
        kind,
        signal: controller.signal,
        onProgress: (loaded) => {
          if (!controller.signal.aborted) setProgress(loaded);
        },
      });
      if (active.current?.controller !== controller || controller.signal.aborted) return;
      setStatus("current");
      onUpdated();
    } catch {
      if (active.current?.controller === controller) setStatus("error");
    } finally {
      onDownloadStateChange?.(false);
      if (active.current?.controller === controller) active.current = null;
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      aria-live="polite"
    >
      {status === "available" ? (
        <>
          <span>توجد نسخة أحدث{size ? ` · ${formatBytes(size)}` : ""}</span>
          <Button size="sm" variant="outline" onClick={() => void update()}>
            تنزيل التحديث
          </Button>
        </>
      ) : (
        <>
          {status === "current" && <span>النسخة المحفوظة محدثة.</span>}
          {status === "error" && (
            <span>تعذّر إكمال الطلب. يمكنك متابعة قراءة النسخة المحفوظة.</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={status === "checking" || status === "downloading"}
            onClick={() => void check(false)}
          >
            {status === "checking"
              ? "جارٍ التحقق…"
              : status === "downloading"
                ? `جارٍ تنزيل التحديث${progress !== null ? ` · ${formatBytes(progress)}` : "…"}`
                : "التحقق من التحديث"}
          </Button>
        </>
      )}
    </div>
  );
}
