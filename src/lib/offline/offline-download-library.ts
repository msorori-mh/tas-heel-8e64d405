/** Settings-only orchestration over the existing verified, resumable pack engine. */
import { supabase } from "@/integrations/supabase/client";
import {
  downloadOfflineSubjectPack,
  inspectOfflineSubjectPack,
  prepareOfflineSubjectPack,
  type OfflinePackDownloadProgress,
  type OfflineSubjectPackLocalStatus,
} from "./offline-pack-downloader";
import { deviceOfflineStateRepository, type OfflinePackRecord } from "./offline-state-store";
import { digestOfflinePackManifest, type OfflinePackManifest } from "./offline-pack-contract";
import { getFreeStorageBytes } from "./network";
import { withForegroundTransfer } from "./download-priority";

export type StudentDownloadScope = { ownerId: string; gradeId: string; trackId: string | null };
export type DownloadSubject = { id: string; name: string };
export type PreparedSubject = DownloadSubject & {
  manifest: OfflinePackManifest;
  manifestSha256: string;
  omitted: number;
};
export type DownloadPlan = {
  subjects: PreparedSubject[];
  unavailable: (DownloadSubject & { reason: string })[];
};
export type SavedSubject = DownloadSubject & { local: OfflineSubjectPackLocalStatus };
export type LibraryProgress = {
  subjectName: string;
  completed: number;
  count: number;
  loadedBytes: number;
  totalBytes: number;
};

function check(signal: AbortSignal) {
  if (signal.aborted) throw new Error("OFFLINE_DOWNLOAD_ABORTED");
}

/** Bound catalog/manifest waits, including an auth refresh that has stopped responding. */
async function metadataRequest<T>(
  parent: AbortSignal,
  work: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 120_000,
): Promise<T> {
  check(parent);
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await Promise.race([
      Promise.resolve(work(controller.signal)),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(
              new Error(parent.aborted ? "OFFLINE_DOWNLOAD_ABORTED" : "OFFLINE_METADATA_TIMEOUT"),
            );
          },
          { once: true },
        ),
      ),
    ]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  }
}

export const manifestBytes = (manifest: OfflinePackManifest) =>
  manifest.artifacts.reduce((sum, artifact) => sum + artifact.byteSize, 0);

/** Both semesters, same grade/shared-track rules as the existing student subject grid. */
export async function prepareStudentDownloads(
  scope: StudentDownloadScope,
  signal: AbortSignal,
  onSubject?: (name: string) => void,
): Promise<DownloadPlan> {
  return withForegroundTransfer(async () => {
    const { data, error } = await metadataRequest(
      signal,
      (requestSignal) =>
        supabase
          .from("subjects")
          .select("id,name,curriculum_track_id")
          .eq("grade_id", scope.gradeId)
          .order("sort_order")
          .abortSignal(requestSignal),
      45_000,
    );
    if (error) throw error;
    const subjects = (data ?? []).filter(
      (row) => row.curriculum_track_id === null || row.curriculum_track_id === scope.trackId,
    );
    const plan: DownloadPlan = { subjects: [], unavailable: [] };
    // The server deliberately accepts two manifest builders at a time. Match that
    // capacity here instead of serialising every subject (slow) or bursting all of
    // them together (503s under normal mobile traffic).
    for (let offset = 0; offset < subjects.length; offset += 2) {
      const batch = subjects.slice(offset, offset + 2);
      const batchController = new AbortController();
      const abortBatch = () => batchController.abort();
      signal.addEventListener("abort", abortBatch, { once: true });
      let results;
      try {
        results = await Promise.all(
          batch.map(async (subject) => {
            check(signal);
            onSubject?.(subject.name);
            try {
              const prepared = await metadataRequest(batchController.signal, (requestSignal) =>
                prepareOfflineSubjectPack(subject.id, {
                  expectedOwnerId: scope.ownerId,
                  signal: requestSignal,
                }),
              );
              check(signal);
              if (
                prepared.manifest.scope.gradeId !== scope.gradeId ||
                (prepared.manifest.scope.curriculumTrackId !== null &&
                  prepared.manifest.scope.curriculumTrackId !== scope.trackId)
              ) {
                throw new Error("OFFLINE_MANIFEST_SCOPE_MISMATCH");
              }
              const manifestSha256 = await digestOfflinePackManifest(prepared.manifest);
              check(signal);
              return {
                kind: "prepared" as const,
                value: { id: subject.id, name: subject.name, ...prepared, manifestSha256 },
              };
            } catch (error) {
              check(signal);
              const code = error instanceof Error ? error.message : "";
              if (!/^OFFLINE_MANIFEST_FETCH_(403|404|409|422|500|502|503|504)$/.test(code)) {
                batchController.abort();
                throw error;
              }
              return {
                kind: "unavailable" as const,
                value: {
                  id: subject.id,
                  name: subject.name,
                  reason: code.endsWith("403")
                    ? "غير متاحة للتنزيل بحسابك"
                    : /_(500|502|503|504)$/.test(code)
                      ? "تعذّر تجهيزها مؤقتًا؛ حدّث القائمة لاستكمالها"
                      : "لم يتوفر محتوى قابل للتنزيل بعد",
                },
              };
            }
          }),
        );
      } finally {
        signal.removeEventListener("abort", abortBatch);
      }
      for (const result of results) {
        if (result.kind === "prepared") plan.subjects.push(result.value);
        else plan.unavailable.push(result.value);
      }
    }
    return plan;
  });
}

/** Read private local records first; opening Settings never fetches a manifest. */
export async function readSavedStudentDownloads(
  ownerId: string,
  signal: AbortSignal,
): Promise<SavedSubject[]> {
  const snapshot = await deviceOfflineStateRepository.read();
  const rows: SavedSubject[] = [];
  for (const record of snapshot.packs.filter((pack) => pack.ownerId === ownerId)) {
    check(signal);
    const id = record.manifest.scope.subjectId;
    if (!id) continue;
    const local = await inspectOfflineSubjectPack(id, undefined, signal);
    check(signal);
    if (local.ownerId !== ownerId) throw new Error("OFFLINE_OWNER_CHANGED");
    rows.push({ id, name: record.manifest.scope.subjectTitle ?? "مادة محفوظة", local });
  }
  return rows;
}

export async function downloadStudentSubjects(params: {
  ownerId: string;
  subjects: PreparedSubject[];
  signal: AbortSignal;
  onProgress: (value: LibraryProgress) => void;
  onReady: (subjectId: string, record: OfflinePackRecord) => Promise<void>;
}): Promise<void> {
  return withForegroundTransfer(async () => {
    const { subjects, signal } = params;
    const totalBytes = subjects.reduce((sum, subject) => sum + manifestBytes(subject.manifest), 0);
    let completedBytes = 0;
    for (let index = 0; index < subjects.length; index += 1) {
      check(signal);
      const subject = subjects[index];
      const report = (progress?: OfflinePackDownloadProgress) =>
        params.onProgress({
          subjectName: subject.name,
          completed: index,
          count: subjects.length,
          loadedBytes: completedBytes + (progress?.loadedBytes ?? 0),
          totalBytes,
        });
      report();
      const local = await inspectOfflineSubjectPack(subject.id, undefined, signal);
      check(signal);
      if (local.ownerId !== params.ownerId) throw new Error("OFFLINE_OWNER_CHANGED");
      const reusable = subject.manifest.artifacts.filter(
        (artifact) =>
          local.presentArtifactIds.has(artifact.artifactId) &&
          local.record?.manifest.artifacts.some(
            (saved) =>
              saved.artifactId === artifact.artifactId &&
              saved.sha256 === artifact.sha256 &&
              saved.byteSize === artifact.byteSize,
          ),
      );
      const remaining =
        manifestBytes(subject.manifest) -
        reusable.reduce((sum, artifact) => sum + artifact.byteSize, 0);
      const free = await getFreeStorageBytes();
      check(signal);
      if (free !== null && free < remaining) throw new Error("OFFLINE_INSUFFICIENT_STORAGE");
      const record = await downloadOfflineSubjectPack({
        subjectId: subject.id,
        manifest: subject.manifest,
        expectedOwnerId: params.ownerId,
        signal,
        onProgress: report,
      });
      completedBytes += manifestBytes(subject.manifest);
      await params.onReady(subject.id, record);
      check(signal);
      params.onProgress({
        subjectName: subject.name,
        completed: index + 1,
        count: subjects.length,
        loadedBytes: completedBytes,
        totalBytes,
      });
    }
  });
}
