/** Settings-only orchestration over the existing verified, resumable pack engine. */
import { OfflineLibraryPartialError, offlineDownloadErrorMessage } from "./offline-download-error";
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
export type DownloadSubject = { id: string; name: string; semester?: number | null };
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
  verifiedFiles?: number;
  totalFiles?: number;
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

/** Lightweight catalog only: no manifests, source bodies or sizes before selection. */
export async function listStudentDownloadSubjects(
  scope: StudentDownloadScope,
  signal: AbortSignal,
): Promise<DownloadSubject[]> {
  const { data, error } = await metadataRequest(
    signal,
    (requestSignal) =>
      supabase
        .from("subjects")
        .select("id,name,semester,curriculum_track_id")
        .eq("grade_id", scope.gradeId)
        .order("sort_order")
        .abortSignal(requestSignal),
    45_000,
  );
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.curriculum_track_id === null || row.curriculum_track_id === scope.trackId)
    .map((row) => ({ id: row.id, name: row.name, semester: row.semester }));
}

export type DirectDownloadProgress = {
  subjectId: string;
  subjectName: string;
  subjectIndex: number;
  subjectCount: number;
  completedSubjects: number;
  phase: "preparing" | "downloading" | "ready" | "failed";
  loadedBytes: number;
  totalBytes: number | null;
  verifiedFiles: number;
  totalFiles: number | null;
  reason?: string;
};

/** Prepare one selected subject and immediately transfer it, then continue the queue. */
export async function downloadSelectedStudentSubjects(params: {
  scope: StudentDownloadScope;
  subjects: DownloadSubject[];
  signal: AbortSignal;
  onProgress: (value: DirectDownloadProgress) => void;
  onReady: (subject: DownloadSubject, record: OfflinePackRecord) => Promise<void>;
}): Promise<void> {
  return withForegroundTransfer(async () => {
    const subjects = [...new Map(params.subjects.map((subject) => [subject.id, subject])).values()];
    const failures: { id: string; name: string; reason: string }[] = [];
    let completed = 0;
    for (const [index, subject] of subjects.entries()) {
      check(params.signal);
      let progress: DirectDownloadProgress = {
        subjectId: subject.id,
        subjectName: subject.name,
        subjectIndex: index + 1,
        subjectCount: subjects.length,
        completedSubjects: completed,
        phase: "preparing",
        loadedBytes: 0,
        totalBytes: null,
        verifiedFiles: 0,
        totalFiles: null,
      };
      params.onProgress(progress);
      let downloaded: OfflinePackRecord | undefined;
      try {
        const prepared = await metadataRequest(params.signal, (signal) =>
          prepareOfflineSubjectPack(subject.id, { expectedOwnerId: params.scope.ownerId, signal }),
        );
        check(params.signal);
        if (
          prepared.manifest.scope.subjectId !== subject.id ||
          prepared.manifest.scope.gradeId !== params.scope.gradeId ||
          (prepared.manifest.scope.curriculumTrackId !== null &&
            prepared.manifest.scope.curriculumTrackId !== params.scope.trackId)
        )
          throw new Error("OFFLINE_MANIFEST_SCOPE_MISMATCH");
        const manifestSha256 = await digestOfflinePackManifest(prepared.manifest);
        progress = {
          ...progress,
          phase: "downloading",
          totalBytes: manifestBytes(prepared.manifest),
          totalFiles: prepared.manifest.artifacts.length,
        };
        params.onProgress(progress);
        await downloadStudentSubjects({
          ownerId: params.scope.ownerId,
          subjects: [{ ...subject, ...prepared, manifestSha256 }],
          signal: params.signal,
          onProgress: (value) => {
            progress = {
              ...progress,
              loadedBytes: value.loadedBytes,
              verifiedFiles: value.verifiedFiles ?? progress.verifiedFiles,
            };
            params.onProgress(progress);
          },
          onReady: async (_id, record) => {
            downloaded = record;
          },
        });
      } catch (error) {
        check(params.signal);
        const code = error instanceof Error ? error.message : "";
        if (
          !(error instanceof OfflineLibraryPartialError) &&
          code !== "OFFLINE_METADATA_TIMEOUT" &&
          !/^OFFLINE_MANIFEST_FETCH_(403|404|409|422|429|500|502|503|504)$/.test(code) &&
          !(error instanceof TypeError && code === "Failed to fetch")
        )
          throw error;
        const reason = offlineDownloadErrorMessage(error);
        failures.push({ id: subject.id, name: subject.name, reason });
        params.onProgress({ ...progress, phase: "failed", reason });
        continue;
      }
      check(params.signal);
      if (!downloaded || downloaded.status !== "ready") throw new Error("OFFLINE_PACK_NOT_READY");
      // UI/callback failures must never be swallowed as transfer failures.
      await params.onReady(subject, downloaded);
      check(params.signal);
      completed += 1;
      params.onProgress({
        ...progress,
        phase: "ready",
        completedSubjects: completed,
        loadedBytes: progress.totalBytes ?? 0,
        verifiedFiles: progress.totalFiles ?? 0,
      });
    }
    if (failures.length) throw new OfflineLibraryPartialError(failures);
  });
}

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
              if (
                code !== "OFFLINE_METADATA_TIMEOUT" &&
                !/^OFFLINE_MANIFEST_FETCH_(403|404|409|422|429|500|502|503|504)$/.test(code)
              ) {
                batchController.abort();
                throw error;
              }
              return {
                kind: "unavailable" as const,
                value: {
                  id: subject.id,
                  name: subject.name,
                  reason: code.endsWith("422")
                    ? "لم يتوفر محتوى قابل للتنزيل بعد"
                    : offlineDownloadErrorMessage(error),
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
    let readyCount = 0;
    const failures: { id: string; name: string; reason: string }[] = [];
    for (let index = 0; index < subjects.length; index += 1) {
      check(signal);
      const subject = subjects[index];
      let verifiedBytes = 0;
      const report = (progress?: OfflinePackDownloadProgress) => {
        if (progress && (progress.status === "cached" || progress.status === "verified")) {
          verifiedBytes = progress.loadedBytes;
        }
        params.onProgress({
          subjectName: subject.name,
          completed: readyCount,
          count: subjects.length,
          loadedBytes: completedBytes + (progress?.loadedBytes ?? 0),
          totalBytes,
          ...(progress
            ? {
                verifiedFiles:
                  progress.artifactIndex +
                  (progress.status === "verified" || progress.status === "cached" ? 1 : 0),
                totalFiles: progress.artifactCount,
              }
            : {}),
        });
      };
      report();
      let record: OfflinePackRecord;
      try {
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
        record = await downloadOfflineSubjectPack({
          subjectId: subject.id,
          manifest: subject.manifest,
          expectedOwnerId: params.ownerId,
          signal,
          onProgress: report,
        });
      } catch (error) {
        check(signal);
        const code = error instanceof Error ? error.message : "";
        // Stop on identity/storage/integrity failures. Only isolated transfer
        // failures can be skipped; verified files remain resumable.
        if (
          code !== "OFFLINE_ARTIFACT_NETWORK_FAILED" &&
          !/^OFFLINE_ARTIFACT_DOWNLOAD_(404|429|500|502|503|504)$/.test(code)
        )
          throw error;
        completedBytes += verifiedBytes;
        failures.push({
          id: subject.id,
          name: subject.name,
          reason: offlineDownloadErrorMessage(error),
        });
        continue;
      }
      completedBytes += manifestBytes(subject.manifest);
      readyCount += 1;
      await params.onReady(subject.id, record);
      check(signal);
      params.onProgress({
        subjectName: subject.name,
        completed: readyCount,
        count: subjects.length,
        loadedBytes: completedBytes,
        totalBytes,
      });
    }
    if (failures.length) throw new OfflineLibraryPartialError(failures);
  });
}
