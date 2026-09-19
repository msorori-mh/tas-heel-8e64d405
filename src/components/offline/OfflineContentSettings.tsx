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
  downloadStudentSubjects,
  manifestBytes,
  prepareStudentDownloads,
  readSavedStudentDownloads,
  type DownloadPlan,
  type LibraryProgress,
  type PreparedSubject,
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
  const [plan, setPlan] = useState<DownloadPlan | null>(null);
  const [busy, setBusy] = useState<"prepare" | "download" | "delete" | null>(null);
  const [checkingLocal, setCheckingLocal] = useState(true);
  const [preparing, setPreparing] = useState("");
  const [progress, setProgress] = useState<LibraryProgress | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const operation = useRef<AbortController | null>(null);

  const refresh = async (signal: AbortSignal) => {
    const rows = await readSavedStudentDownloads(scope.ownerId, signal);
    if (!signal.aborted) setSaved(rows);
  };
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void readSavedStudentDownloads(scope.ownerId, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setSaved(rows);
      })
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
  }, [scope.ownerId]);

  const run = async (
    kind: "prepare" | "download" | "delete",
    work: (signal: AbortSignal) => Promise<void>,
  ) => {
    if (operation.current || !lifetime.current || lifetime.current.signal.aborted) return;
    const controller = new AbortController();
    const live = lifetime.current.signal;
    operation.current = controller;
    setBusy(kind);
    setMessage("");
    setError("");
    setConfirmDelete(null);
    setProgress(null);
    try {
      await work(controller.signal);
    } catch (failure) {
      if (live.aborted) return;
      if (controller.signal.aborted) {
        setMessage("توقف الطلب. الملفات المكتملة محفوظة، ويمكنك استكمال الباقي لاحقًا.");
      } else {
        setError(offlineDownloadErrorMessage(failure));
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
          setPreparing("");
          setProgress(null);
        }
      }
      if (operation.current === controller) operation.current = null;
    }
  };
  const prepare = () =>
    void run("prepare", async (signal) => {
      const next = await prepareStudentDownloads(scope, signal, (name) => {
        if (!signal.aborted) setPreparing(name);
      });
      if (!signal.aborted) {
        setPlan(next);
        setMessage(
          next.subjects.length
            ? next.unavailable.length
              ? `تم تجهيز ${next.subjects.length} مواد. تعذّر تجهيز ${next.unavailable.length} مؤقتًا؛ يمكنك تنزيل الجاهز ثم تحديث القائمة.`
              : "راجع الحجم ثم ابدأ التنزيل."
            : next.unavailable.length
              ? "تعذّر تجهيز المواد. راجع الأسباب أدناه ثم أعد تحديث القائمة."
              : "لا يوجد محتوى قابل للتنزيل لصفك حاليًا.",
        );
      }
    });
  const download = (subjects: PreparedSubject[]) =>
    void run("download", async (signal) => {
      await downloadStudentSubjects({
        ownerId: scope.ownerId,
        subjects,
        signal,
        onProgress: (value) => {
          if (!signal.aborted) setProgress(value);
        },
        onReady: async (subjectId, record) => {
          if (signal.aborted) return;
          const subject = subjects.find((item) => item.id === subjectId)!;
          // The downloader just verified persisted bytes; avoid re-hashing all previous books.
          const row: SavedSubject = {
            id: subjectId,
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
          setSaved((current) => [...current.filter((item) => item.id !== subjectId), row]);
        },
      });
      if (!signal.aborted) setMessage("اكتمل تنزيل المحتوى المحدد. افتح المواد والدروس كالمعتاد.");
    });
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

  const used = saved.reduce((sum, row) => sum + row.local.presentBytes, 0);
  const total = plan?.subjects.reduce((sum, row) => sum + manifestBytes(row.manifest), 0) ?? 0;
  const omitted = plan?.subjects.reduce((sum, row) => sum + row.omitted, 0) ?? 0;
  const rows = [
    ...(plan?.subjects ?? []),
    ...saved.filter((row) => !plan?.subjects.some((subject) => subject.id === row.id)),
  ];
  const disabled = !!busy || checkingLocal;

  return (
    <div className="space-y-3 border-t border-border/60 pt-3" aria-label="تنزيل المحتوى دون إنترنت">
      <div>
        <h3 className="text-sm font-bold">تحميل المحتوى كاملًا</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          حمّل المحتوى المتاح لمواد صفك في الفصلين، ثم افتح دروسك من الصفحات المعتادة. يشمل الكتب
          والشروح والملخصات والأسئلة والأنشطة المتاحة للتنزيل. الفيديو والروابط الخارجية تحتاج إلى
          الإنترنت.
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        تُحفظ الملفات داخل مساحة التطبيق الخاصة
        {isNativeStorage() ? " على هاتفك" : " في هذا المتصفح"}. يُفضّل التنزيل عبر Wi-Fi. الملفات
        المكتملة لا تُحمّل مجددًا ما لم تتغير.
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full whitespace-normal"
        disabled={disabled}
        onClick={prepare}
      >
        {busy === "prepare" ? (
          <Loader2 className="ms-2 h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Download className="ms-2 h-4 w-4 shrink-0" />
        )}
        {plan ? "تحديث قائمة المحتوى والحجم" : "عرض المحتوى وحجم التنزيل"}
      </Button>

      {!!plan?.subjects.length && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-semibold">
            {plan.subjects.length} مواد · الحجم الكلي {formatBytes(total)}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            الحجم يشمل الملفات المحفوظة؛ يُنزَّل الجديد والناقص فقط.
          </p>
          {omitted > 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              هناك {omitted} عناصر غير مشمولة لأنها غير جاهزة للتنزيل أو تعتمد على الإنترنت.
            </p>
          )}
          <Button
            type="button"
            className="min-h-11 w-full whitespace-normal"
            disabled={disabled}
            onClick={() => download(plan.subjects)}
          >
            تحميل الكل / استكمال التنزيل
          </Button>
        </div>
      )}
      {busy && (
        <div role="status" className="space-y-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed">
          <p>
            {busy === "prepare"
              ? `جارٍ تحديد الحجم${preparing ? `: ${preparing}` : "…"}`
              : busy === "delete"
                ? "جارٍ حذف النسخة من الجهاز…"
                : `جارٍ تنزيل: ${progress?.subjectName ?? "المحتوى"}`}
          </p>
          {progress && (
            <>
              <Progress
                aria-label="تقدم تنزيل المحتوى"
                value={progress.totalBytes ? (100 * progress.loadedBytes) / progress.totalBytes : 0}
              />
              <p>
                {Math.round(
                  progress.totalBytes ? (100 * progress.loadedBytes) / progress.totalBytes : 0,
                )}
                ٪ · {progress.completed} / {progress.count} مواد مكتملة ·{" "}
                {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)}
              </p>
            </>
          )}
          {busy !== "delete" && (
            <>
              <p>
                اترك هذا القسم مفتوحًا أثناء التنزيل. عند مغادرته يتوقف الطلب وتبقى الملفات المكتملة
                محفوظة.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => operation.current?.abort()}
              >
                إيقاف
              </Button>
            </>
          )}
        </div>
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

      {rows.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border px-3">
          {rows.map((row) => {
            const local = saved.find((item) => item.id === row.id)?.local;
            const prepared = plan?.subjects.find((item) => item.id === row.id);
            const changed =
              !!prepared &&
              !!local?.record &&
              local.record.manifestSha256 !== prepared.manifestSha256;
            return (
              <li key={row.id} className="space-y-2 py-3">
                <div className="space-y-1">
                  <p className="break-words text-sm font-semibold">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {local?.ready === true
                      ? "متاح دون إنترنت"
                      : local?.record
                        ? "التنزيل غير مكتمل"
                        : "لم يُنزّل بعد"}
                    {changed ? " · يتوفر تحديث" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {prepared && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={disabled}
                      onClick={() => download([prepared])}
                      aria-label={`تنزيل ${row.name}`}
                    >
                      {changed
                        ? "تنزيل التحديث"
                        : local?.ready
                          ? "فحص واستكمال"
                          : local?.record
                            ? "استكمال التنزيل"
                            : "تنزيل المادة"}
                    </Button>
                  )}
                  {local?.record && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      disabled={disabled}
                      onClick={() => setConfirmDelete(row.id)}
                      aria-label={`حذف تنزيل ${row.name}`}
                    >
                      <Trash2 className="ms-1 h-4 w-4" />
                      حذف
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!!plan?.unavailable.length && (
        <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          {plan.unavailable.map((row) => (
            <li key={row.id}>
              {row.name}: {row.reason}
            </li>
          ))}
        </ul>
      )}
      {saved.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
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
              type="button"
              variant="destructive"
              size="sm"
              className="min-h-11"
              disabled={disabled}
              onClick={remove}
            >
              تأكيد الحذف
            </Button>
            <Button
              type="button"
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
