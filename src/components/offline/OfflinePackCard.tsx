/**
 * 18C-4 — "تحميل المحتوى للاستخدام دون إنترنت" card.
 *
 * Used for a subject pack (subject page) and for the opt-in grade pack
 * (settings). Shows the estimated size before downloading, live progress,
 * cancel, and retry for failed files.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload, Loader2, Smartphone, Trash2, Wifi, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  downloadPack,
  estimatePackSize,
  getPackStatus,
  type PackProgress,
  type PackResource,
} from "@/lib/offline/offline-pack";
import { removeFile } from "@/lib/offline/pdf-cache";
import { formatBytes } from "@/lib/offline/network";

export type OfflinePackCardProps = {
  title: string;
  lessonIds: string[];
  subjectId?: string | null;
  description?: string;
};

export function OfflinePackCard({
  title,
  lessonIds,
  subjectId,
  description,
}: OfflinePackCardProps) {
  const [resources, setResources] = useState<PackResource[]>([]);
  const [cachedCount, setCachedCount] = useState(0);
  const [missing, setMissing] = useState<PackResource[]>([]);
  const [estimate, setEstimate] = useState<{ bytes: number; unknown: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (lessonIds.length === 0) {
      setResources([]);
      setMissing([]);
      setCachedCount(0);
      return;
    }
    const status = await getPackStatus(lessonIds);
    setResources(status.resources);
    setCachedCount(status.cachedIds.size);
    setMissing(status.resources.filter((r) => !status.cachedIds.has(r.resourceId)));
  }, [lessonIds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (resources.length === 0) return null;

  const handleEstimate = async () => {
    setEstimating(true);
    try {
      setEstimate(await estimatePackSize(missing.map((r) => r.resourceId)));
    } finally {
      setEstimating(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await downloadPack({
        resources: missing,
        subjectId,
        signal: controller.signal,
        onProgress: setProgress,
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
      await refresh();
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      for (const r of resources) await removeFile(r.resourceId);
    } finally {
      setBusy(false);
      setEstimate(null);
      setProgress(null);
      await refresh();
    }
  };

  const failedCount = progress?.failed.length ?? 0;
  const percent = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <section dir="rtl" className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {description ?? "احفظ ملفات الدروس على جهازك واقرأها لاحقاً بدون إنترنت."}
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary">
          <CloudDownload className="h-5 w-5" />
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Smartphone className="h-3.5 w-3.5 text-primary" />
          {cachedCount} ملفاً على الجهاز
        </span>
        <span className="inline-flex items-center gap-1">
          <CloudDownload className="h-3.5 w-3.5" />
          {missing.length} ملفاً غير محمّل
        </span>
      </div>

      {estimate && missing.length > 0 && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          الحجم التقريبي: {formatBytes(estimate.bytes)}
          {estimate.unknown > 0 ? ` (+${estimate.unknown} ملفاً بحجم غير معروف)` : ""} —
          <span className="inline-flex items-center gap-1 ps-1">
            <Wifi className="h-3.5 w-3.5" /> يُفضّل استخدام Wi-Fi.
          </span>
        </p>
      )}

      {progress && progress.total > 0 && (
        <div className="space-y-1">
          <Progress value={percent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress.done} من {progress.total}
            {progress.currentTitle ? ` — ${progress.currentTitle}` : ""}
            {failedCount > 0 ? ` • ${failedCount} فشل` : ""}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {missing.length > 0 && !estimate && (
          <Button size="sm" variant="outline" onClick={handleEstimate} disabled={estimating || busy}>
            {estimating && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
            عرض الحجم التقريبي
          </Button>
        )}

        {missing.length > 0 && (
          <Button size="sm" onClick={handleDownload} disabled={busy}>
            {busy ? (
              <Loader2 className="ms-2 h-4 w-4 animate-spin" />
            ) : (
              <CloudDownload className="ms-2 h-4 w-4" />
            )}
            {failedCount > 0 ? "إعادة محاولة التحميل" : "تحميل للاستخدام دون إنترنت"}
          </Button>
        )}

        {busy && (
          <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
            <X className="ms-2 h-4 w-4" />
            إيقاف
          </Button>
        )}

        {cachedCount > 0 && !busy && (
          <Button size="sm" variant="ghost" onClick={handleClear}>
            <Trash2 className="ms-2 h-4 w-4" />
            حذف الملفات المحفوظة
          </Button>
        )}
      </div>
    </section>
  );
}

export default OfflinePackCard;
