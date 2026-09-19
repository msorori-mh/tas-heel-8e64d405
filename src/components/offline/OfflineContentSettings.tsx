import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { isNativeStorage } from "@/lib/offline/pdf-cache";
import {
  deleteAllOfflinePacks,
  deleteOfflineSubjectPack,
} from "@/lib/offline/offline-pack-downloader";
import {
  listStudentDownloadSubjects,
  downloadSelectedStudentSubjects,
  manifestBytes,
  readSavedStudentDownloads,
  type DownloadSubject,
  type DirectDownloadProgress,
  type SavedSubject,
  type StudentDownloadScope,
} from "@/lib/offline/offline-download-library";
import { formatBytes } from "@/lib/offline/network";
import { DataSaverSetting } from "./DataSaverSetting";
import { offlineDownloadErrorMessage } from "@/lib/offline/offline-download-error";

export function OfflineContentSettings() {
  const { user, profile } = useAuth();
  const gradeId = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);
  const trackId = profile?.curriculum_track_id ?? null;
  return (
    <div className="space-y-4" dir="rtl">
      <DataSaverSetting />
      {user && gradeId ? (
        <OfflineDownloadSettings
          key={`${user.id}:${gradeId}:${trackId}`}
          scope={{ ownerId: user.id, gradeId, trackId }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          أكمل بيانات صفك في الملف الشخصي لإظهار محتواك.
        </p>
      )}
    </div>
  );
}

export function OfflineDownloadSettings({ scope }: { scope: StudentDownloadScope }) {
  const [saved, setSaved] = useState<SavedSubject[]>([]);
  const [catalog, setCatalog] = useState<DownloadSubject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [checkingLocal, setCheckingLocal] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [progress, setProgress] = useState<DirectDownloadProgress | null>(null);
  const [activity, setActivity] = useState<Record<string, DirectDownloadProgress>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);

  const refresh = async (signal: AbortSignal) => {
    const rows = await readSavedStudentDownloads(scope.ownerId, signal);
    if (!signal.aborted) setSaved(rows);
  };
  const loadCatalog = async (signal: AbortSignal) => {
    setLoadingCatalog(true);
    setCatalogError("");
    try {
      const rows = await listStudentDownloadSubjects(scope, signal);
      if (!signal.aborted) setCatalog(rows);
    } catch {
      if (!signal.aborted)
        setCatalogError(
          "تعذّر جلب قائمة المواد. المحتوى المحفوظ ما زال متاحًا؛ أعد المحاولة عند عودة الاتصال.",
        );
    } finally {
      if (!signal.aborted) setLoadingCatalog(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void loadCatalog(controller.signal);
    void refresh(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("تعذّر قراءة التنزيلات المحفوظة. أعد فتح هذا القسم للمحاولة.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingLocal(false);
      });
    return () => {
      controller.abort();
      operation.current?.abort();
    };
    // The parent keys this component by account, grade and track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.ownerId, scope.gradeId, scope.trackId]);

  const run = async (kind: "download" | "delete", work: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current || !lifetime.current || lifetime.current.signal.aborted) return;
    const controller = new AbortController(),
      live = lifetime.current.signal;
    operation.current = controller;
    setBusy(kind);
    setMessage("");
    setError("");
    setConfirmDelete(null);
    setProgress(null);
    try {
      await work(controller.signal);
    } catch (failure) {
      if (!live.aborted) {
        if (controller.signal.aborted)
          setMessage("توقف التنزيل. الملفات المكتملة محفوظة؛ حدد المواد واستكمل الناقص لاحقًا.");
        else setError(offlineDownloadErrorMessage(failure));
      }
    } finally {
      if (!live.aborted) {
        try {
          await refresh(live);
        } catch {
          /* Keep the last verified local view. */
        }
        if (!live.aborted) {
          setBusy(null);
          setProgress(null);
        }
      }
      if (operation.current === controller) operation.current = null;
    }
  };
  const download = (subjects: DownloadSubject[]) => {
    if (!subjects.length) return;
    void run("download", async (signal) => {
      setActivity({});
      await downloadSelectedStudentSubjects({
        scope,
        subjects,
        signal,
        onProgress: (value) => {
          if (!signal.aborted) {
            setProgress(value);
            setActivity((current) => ({ ...current, [value.subjectId]: value }));
          }
        },
        onReady: async (subject, record) => {
          if (signal.aborted) return;
          const row: SavedSubject = {
            id: subject.id,
            name: subject.name,
            local: {
              ownerId: scope.ownerId,
              record,
              ready: record.status === "ready",
              presentArtifactIds: new Set(record.verifiedArtifactIds),
              presentBytes: record.downloadedBytes,
              totalBytes: manifestBytes(record.manifest),
            },
          };
          setSaved((current) => [...current.filter((item) => item.id !== subject.id), row]);
          setSelected((current) => {
            const next = new Set(current);
            next.delete(subject.id);
            return next;
          });
        },
      });
      if (!signal.aborted)
        setMessage("اكتمل تنزيل المواد المحددة. افتح دروسك كالمعتاد دون إنترنت.");
    });
  };
  const remove = () => {
    const target = confirmDelete;
    if (!target) return;
    void run("delete", async () => {
      if (target === "all") await deleteAllOfflinePacks(undefined, scope.ownerId);
      else await deleteOfflineSubjectPack(target, undefined, scope.ownerId);
      if (!lifetime.current?.signal.aborted)
        setMessage("حُذفت النسخة من الجهاز. يمكنك تنزيلها مجددًا.");
    });
  };
  const rows: DownloadSubject[] = [
    ...catalog,
    ...saved
      .filter((row) => !catalog.some((item) => item.id === row.id))
      .map((row) => ({
        id: row.id,
        name: row.name,
        semester: row.local.record?.manifest.scope.semester,
      })),
  ];
  const chosen = rows.filter((row) => selected.has(row.id));
  const disabled = !!busy || checkingLocal;
  const used = saved.reduce((sum, row) => sum + row.local.presentBytes, 0);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const percent = progress?.totalBytes
    ? Math.min(
        progress.phase === "ready" ? 100 : 99,
        Math.floor((100 * progress.loadedBytes) / progress.totalBytes),
      )
    : 0;
  return (
    <div className="space-y-4 border-t border-border/60 pt-3" aria-label="تنزيل المحتوى دون إنترنت">
      <div>
        <h3 className="text-sm font-bold">تنزيل المواد دون إنترنت</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          اختر المواد التي تحتاجها واضغط تنزيل. تُحفظ الملفات المكتملة ويُستكمل الناقص عند إعادة
          المحاولة. الفيديو والروابط الخارجية تحتاج إلى الإنترنت.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-3 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          المحتوى المحفوظ على الجهاز
        </span>
        <span className="font-semibold">
          {checkingLocal ? "جارٍ الفحص…" : used ? formatBytes(used) : "لا توجد تنزيلات"}
        </span>
      </div>
      {loadingCatalog && (
        <p role="status" className="text-xs text-muted-foreground">
          جارٍ جلب أسماء المواد…
        </p>
      )}
      {catalogError && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>{catalogError}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy || loadingCatalog}
            onClick={() => lifetime.current && void loadCatalog(lifetime.current.signal)}
          >
            إعادة جلب المواد
          </Button>
        </div>
      )}
      {!loadingCatalog && !catalogError && !rows.length && (
        <p className="text-xs text-muted-foreground">لا توجد مواد لصفك حاليًا.</p>
      )}
      {!!rows.length && (
        <>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label="تحديد كل المواد"
              className="h-5 w-5 accent-primary"
              disabled={disabled}
              checked={chosen.length === rows.length}
              onChange={() =>
                setSelected(
                  chosen.length === rows.length ? new Set() : new Set(rows.map((row) => row.id)),
                )
              }
            />
            تحديد الكل
          </label>
          {[1, 2, 0].map((semester) => {
            const group = rows.filter(
              (row) => (row.semester === 1 || row.semester === 2 ? row.semester : 0) === semester,
            );
            if (!group.length) return null;
            return (
              <fieldset key={semester} className="min-w-0 rounded-xl border border-border px-3">
                <legend className="px-1 text-sm font-semibold">
                  {semester === 1 ? "الفصل الأول" : semester === 2 ? "الفصل الثاني" : "مواد مشتركة"}
                </legend>
                <ul className="divide-y divide-border/60">
                  {group.map((row) => {
                    const local = saved.find((item) => item.id === row.id)?.local,
                      state = activity[row.id];
                    return (
                      <li key={row.id} className="space-y-1 py-3">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            aria-label={`تحديد ${row.name}`}
                            className="h-5 w-5 shrink-0 accent-primary"
                            disabled={disabled}
                            checked={selected.has(row.id)}
                            onChange={() => toggle(row.id)}
                          />
                          <span className="break-words text-sm font-semibold">{row.name}</span>
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {local?.ready
                            ? "متاح دون إنترنت"
                            : local?.record
                              ? "التنزيل غير مكتمل"
                              : "لم يُنزّل بعد"}
                          {local?.record
                            ? ` · ${local.presentArtifactIds.size} / ${local.record.manifest.artifacts.length} ملفات محفوظة`
                            : ""}
                        </p>
                        {state?.phase === "failed" && (
                          <p className="text-xs leading-relaxed text-destructive">{state.reason}</p>
                        )}
                        {local?.record && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-11"
                              disabled={disabled}
                              onClick={() => download([row])}
                              aria-label={`استكمال ${row.name}`}
                            >
                              {local.ready ? "تنزيل التحديثات" : "استكمال التنزيل"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-11"
                              disabled={disabled}
                              onClick={() => setConfirmDelete(row.id)}
                              aria-label={`حذف تنزيل ${row.name}`}
                            >
                              <Trash2 className="ms-1 h-4 w-4" />
                              حذف
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
          <Button
            className="min-h-12 w-full whitespace-normal"
            disabled={disabled || chosen.length === 0}
            onClick={() => download(chosen)}
          >
            <Download className="ms-2 h-4 w-4 shrink-0" />
            تنزيل المواد المحددة{chosen.length ? ` (${chosen.length})` : ""}
          </Button>
        </>
      )}
      {busy === "download" && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-3 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed"
        >
          <p className="font-semibold">
            {!progress || progress.phase === "preparing"
              ? `بدء تنزيل ${progress?.subjectName ?? "المواد المحددة"}…`
              : `تنزيل: ${progress.subjectName}`}
          </p>
          {progress?.totalBytes !== null && progress?.totalBytes !== undefined ? (
            <>
              <Progress aria-label="تقدم تنزيل المادة" value={percent} />
              <p>
                {percent}٪ · {progress.verifiedFiles} / {progress.totalFiles} ملفات محفوظة ·{" "}
                {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)}
              </p>
            </>
          ) : (
            <div
              role="progressbar"
              aria-label="بدء التنزيل"
              aria-valuetext="جارٍ الاتصال وتجهيز أول ملف"
              className="h-2 overflow-hidden rounded-full bg-primary/15"
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
          )}
          {progress && (
            <p>
              المادة {progress.subjectIndex} من {progress.subjectCount} ·{" "}
              {progress.completedSubjects} مواد مكتملة
            </p>
          )}
          <p>
            اترك هذا القسم مفتوحًا أثناء التنزيل. عند إيقافه أو إغلاق التطبيق تبقى الملفات المكتملة
            محفوظة.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => operation.current?.abort()}
          >
            إيقاف التنزيل
          </Button>
        </div>
      )}
      {busy === "delete" && (
        <p role="status" className="text-xs">
          <Loader2 className="inline h-4 w-4 animate-spin" /> جارٍ حذف النسخة من الجهاز…
        </p>
      )}
      {message && (
        <p role="status" className="text-xs leading-relaxed text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        تُحفظ الملفات داخل مساحة التطبيق الخاصة
        {isNativeStorage() ? " على هاتفك" : " في هذا المتصفح"}. يُفضّل التنزيل عبر Wi-Fi. الملفات
        المطابقة المحفوظة لا تُنزّل مجددًا.
      </p>
      {!!saved.length && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 whitespace-normal"
          disabled={disabled}
          onClick={() => setConfirmDelete("all")}
        >
          حذف جميع المواد المحمّلة
        </Button>
      )}
      {confirmDelete && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs leading-relaxed">
            حذف{" "}
            {confirmDelete === "all"
              ? "جميع المواد المحمّلة"
              : `تنزيل «${rows.find((row) => row.id === confirmDelete)?.name ?? "المادة"}»`}{" "}
            من هذا الجهاز؟ يبقى تقدمك الدراسي محفوظًا.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={disabled}
              onClick={remove}
            >
              تأكيد الحذف
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setConfirmDelete(null)}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
export default OfflineContentSettings;
