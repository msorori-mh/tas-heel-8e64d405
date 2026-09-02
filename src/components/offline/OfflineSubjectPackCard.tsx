/** OFFLINE-03 — truthful subject-pack download and device-state surface. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CloudDownload,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  deleteOfflineSubjectPack,
  downloadOfflineSubjectPack,
  fetchOfflineSubjectPackManifest,
  inspectOfflineSubjectPack,
  type OfflinePackDownloadProgress,
  type OfflineSubjectPackLocalStatus,
} from "@/lib/offline/offline-pack-downloader";
import {
  digestOfflinePackManifest,
  type OfflinePackManifest,
} from "@/lib/offline/offline-pack-contract";
import { formatBytes } from "@/lib/offline/network";

export function OfflineSubjectPackCard({
  subjectId,
  subjectName,
}: {
  subjectId: string;
  subjectName: string;
}) {
  const [manifest, setManifest] = useState<OfflinePackManifest | null>(null);
  const [local, setLocal] = useState<OfflineSubjectPackLocalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OfflinePackDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const localResult = await inspectOfflineSubjectPack(subjectId).catch(() => null);
    setLocal(localResult);
    try {
      const latest = await fetchOfflineSubjectPackManifest(subjectId);
      setManifest(latest);
      if (!localResult?.record) {
        setUpdateAvailable(false);
      } else {
        const latestDigest = await digestOfflinePackManifest(latest);
        setUpdateAvailable(latestDigest !== localResult.record.manifestSha256);
      }
      setError(null);
    } catch (caught) {
      if (!localResult?.record) {
        const code = caught instanceof Error ? caught.message : "";
        setError(
          code === "OFFLINE_MANIFEST_FETCH_422"
            ? "لا يوجد محتوى موثّق متاح للتنزيل في هذه المادة بعد."
            : "تعذّر التحقق من حزمة المادة الآن.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const effectiveManifest = manifest ?? local?.record?.manifest ?? null;
  const totalBytes = effectiveManifest?.artifacts.reduce(
    (sum, artifact) => sum + artifact.byteSize,
    0,
  );
  const artifactCount = effectiveManifest?.artifacts.length ?? 0;
  const presentCount = local?.presentArtifactIds.size ?? 0;
  const percent = useMemo(() => {
    if (progress && progress.totalBytes > 0) {
      return Math.round((progress.loadedBytes / progress.totalBytes) * 100);
    }
    if (local && local.totalBytes > 0) {
      return Math.round((local.presentBytes / local.totalBytes) * 100);
    }
    return 0;
  }, [local, progress]);
  const ready = local?.ready === true && !updateAvailable;

  const handleDownload = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      await downloadOfflineSubjectPack({
        subjectId,
        signal: controller.signal,
        onProgress: setProgress,
      });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(
        code === "OFFLINE_DOWNLOAD_ABORTED"
          ? "توقف التنزيل. يمكنك استكماله لاحقًا دون إعادة الملفات المكتملة."
          : "تعذّر إكمال التنزيل. احتفظنا بالملفات السليمة للمحاولة التالية.",
      );
    } finally {
      abortRef.current = null;
      setBusy(false);
      await refresh();
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteOfflineSubjectPack(subjectId);
      setProgress(null);
    } catch {
      setError("تعذّر حذف الحزمة من الجهاز.");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  if (loading && !effectiveManifest) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card" dir="rtl">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ فحص المحتوى المتاح دون إنترنت…
        </span>
      </section>
    );
  }

  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card"
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            تحميل «{subjectName}» للاستخدام دون إنترنت
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            يحفظ المحتوى المعتمد والكتب الموثّقة داخل مساحة التطبيق الخاصة.
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary">
          {ready ? <CheckCircle2 className="h-5 w-5" /> : <CloudDownload className="h-5 w-5" />}
        </span>
      </div>

      {effectiveManifest && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5 text-primary" />
            {formatBytes(totalBytes)}
          </span>
          <span>
            {presentCount} من {artifactCount} ملف موثّق على الجهاز
          </span>
          {ready && <span className="font-semibold text-emerald-700">متاح دون إنترنت</span>}
          {updateAvailable && <span className="font-semibold text-amber-700">يتوفر تحديث</span>}
        </div>
      )}

      {(progress || (local && local.presentBytes > 0)) && effectiveManifest && (
        <div className="space-y-1.5">
          <Progress value={percent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {percent}%{progress?.status === "downloading" ? " — جارٍ التحقق من الملف الحالي" : ""}
          </p>
        </div>
      )}

      {effectiveManifest && !ready && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Wifi className="h-3.5 w-3.5" /> يُفضّل استخدام Wi-Fi.
          </span>{" "}
          عند الانقطاع ستُستكمل الملفات الناقصة فقط.
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {effectiveManifest && !ready && (
          <Button size="sm" onClick={handleDownload} disabled={busy}>
            {busy ? (
              <Loader2 className="ms-2 h-4 w-4 animate-spin" />
            ) : updateAvailable ? (
              <RefreshCw className="ms-2 h-4 w-4" />
            ) : (
              <CloudDownload className="ms-2 h-4 w-4" />
            )}
            {updateAvailable
              ? "تحديث المحتوى"
              : presentCount > 0
                ? "استكمال التنزيل"
                : "تنزيل المادة"}
          </Button>
        )}
        {busy && (
          <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
            <X className="ms-2 h-4 w-4" /> إيقاف
          </Button>
        )}
        {local?.record && !busy && (
          <Button size="sm" variant="ghost" onClick={handleDelete}>
            <Trash2 className="ms-2 h-4 w-4" /> حذف من الجهاز
          </Button>
        )}
        {!effectiveManifest && !loading && (
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="ms-2 h-4 w-4" /> إعادة المحاولة
          </Button>
        )}
      </div>
    </section>
  );
}

export default OfflineSubjectPackCard;
