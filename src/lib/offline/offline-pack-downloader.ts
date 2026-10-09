import { fetchOfflineRead } from "./offline-fetch";
import { offlineResponseError } from "./offline-download-error";
/** OFFLINE-02 — differential, file-resumable subject pack downloader. */

import { supabase } from "@/integrations/supabase/client";

import {
  readOfflineArtifactBytes,
  removeOfflineArtifact,
  saveOfflineArtifactBytes,
} from "./offline-artifact-cache";
import {
  parseOfflinePackManifest,
  verifyOfflineArtifact,
  type OfflinePackArtifact,
  type OfflinePackManifest,
} from "./offline-pack-contract";
import {
  invalidateOfflineArtifact,
  markOfflinePackFailed,
  recordVerifiedOfflineArtifact,
  registerOfflinePack,
  removeOfflinePackRecord,
  startOfflinePackDownload,
} from "./offline-pack-state";
import {
  deviceOfflineStateRepository,
  type OfflinePackRecord,
  type OfflineStateRepository,
} from "./offline-state-store";
import { getEntry, readFile, removeFile, saveFile } from "./pdf-cache";

export type OfflinePackDownloadProgress = {
  artifactId: string;
  artifactIndex: number;
  artifactCount: number;
  loadedBytes: number;
  totalBytes: number;
  status: "cached" | "downloading" | "verifying" | "saving" | "verified";
  activeDownloads?: number;
  verifiedBytes?: number;
  verifiedFiles?: number;
  bytesPerSecond?: number;
};

export interface OfflinePackDownloadIo {
  read(ownerId: string, artifact: OfflinePackArtifact): Promise<Uint8Array | null>;
  fetch(
    artifact: OfflinePackArtifact,
    signal?: AbortSignal,
    onProgress?: (loaded: number) => void,
  ): Promise<Uint8Array>;
  save(ownerId: string, artifact: OfflinePackArtifact, bytes: Uint8Array): Promise<void>;
}

async function cancellableSession(signal?: AbortSignal) {
  checkDownloadSignal(signal);
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error("OFFLINE_DOWNLOAD_ABORTED"));
        signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

async function sessionIdentity(signal?: AbortSignal): Promise<{ ownerId: string; token: string }> {
  const { data } = await cancellableSession(signal);
  const ownerId = data.session?.user.id;
  const token = data.session?.access_token;
  if (!ownerId || !token) throw new Error("OFFLINE_UNAUTHENTICATED");
  return { ownerId, token };
}

async function sessionOwnerId(signal?: AbortSignal): Promise<string> {
  const { data } = await cancellableSession(signal);
  const ownerId = data.session?.user.id;
  if (!ownerId) throw new Error("OFFLINE_UNAUTHENTICATED");
  return ownerId;
}

function artifactEndpoint(artifact: OfflinePackArtifact): string {
  if (artifact.kind === "textbook-pdf") {
    return `/api/subject-textbook/${encodeURIComponent(artifact.resourceId)}`;
  }
  if (artifact.kind === "lesson-pdf") {
    return `/api/lesson-file/${encodeURIComponent(artifact.resourceId)}`;
  }
  return `/api/offline-pack/artifact/${encodeURIComponent(artifact.resourceId)}`;
}

function createDeviceIo(expectedOwnerId: string): OfflinePackDownloadIo {
  return {
    async read(ownerId, artifact) {
      if (artifact.kind === "textbook-pdf" || artifact.kind === "lesson-pdf") {
        const entry = await getEntry(artifact.resourceId);
        if (
          !entry ||
          entry.contentSha256 !== artifact.sha256 ||
          entry.fileSize !== artifact.byteSize
        ) {
          return null;
        }
        const blob = await readFile(artifact.resourceId);
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      }
      return readOfflineArtifactBytes(ownerId, artifact);
    },
    async fetch(artifact, signal, onProgress) {
      // A subject can take longer than a session token's lifetime. Resolve the
      // current (SDK-refreshed) token for each file, keeping the owner fixed.
      const { token } = await checkedIdentity({ expectedOwnerId, signal });
      const response = await fetchOfflineRead(artifactEndpoint(artifact), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok) throw await offlineResponseError(response, "OFFLINE_ARTIFACT_DOWNLOAD");
      if (!response.body || !onProgress) {
        return new Uint8Array(await response.arrayBuffer());
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          onProgress(loaded);
        }
      }
      const bytes = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
    async save(ownerId, artifact, bytes) {
      await checkedIdentity({ expectedOwnerId: ownerId });
      if (artifact.kind === "textbook-pdf" || artifact.kind === "lesson-pdf") {
        await saveFile({
          resourceId: artifact.resourceId,
          lessonId: artifact.lessonId,
          subjectId: null,
          blob: new Blob([Uint8Array.from(bytes)], { type: artifact.contentType }),
          version: artifact.sha256,
          contentType: artifact.contentType,
          contentSha256: artifact.sha256,
          pinnedOffline: true,
        });
        await checkedIdentity({ expectedOwnerId: ownerId });
        return;
      }
      await saveOfflineArtifactBytes(ownerId, artifact, bytes);
      await checkedIdentity({ expectedOwnerId: ownerId });
    },
  };
}

export type OfflineDownloadRequest = { signal?: AbortSignal; expectedOwnerId?: string };

function checkDownloadSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("OFFLINE_DOWNLOAD_ABORTED");
}

async function checkedIdentity(options: OfflineDownloadRequest) {
  checkDownloadSignal(options.signal);
  const identity = await sessionIdentity(options.signal);
  checkDownloadSignal(options.signal);
  if (options.expectedOwnerId && identity.ownerId !== options.expectedOwnerId) {
    throw new Error("OFFLINE_OWNER_CHANGED");
  }
  return identity;
}

async function fetchOfflineSubjectPackManifestWithIdentity(
  subjectId: string,
  options: OfflineDownloadRequest = {},
): Promise<{
  ownerId: string;
  token: string;
  manifest: OfflinePackManifest;
  omitted: number;
  unavailableQuestions: number;
}> {
  const identity = await checkedIdentity(options);
  const response = await fetchOfflineRead(
    `/api/offline-pack/manifest/${encodeURIComponent(subjectId)}`,
    {
      headers: { Authorization: `Bearer ${identity.token}` },
      signal: options.signal,
    },
  );
  if (!response.ok) throw await offlineResponseError(response, "OFFLINE_MANIFEST_FETCH");
  const payload = (await response.json()) as {
    manifest?: unknown;
    omitted?: unknown;
    unavailableQuestions?: unknown;
  };
  checkDownloadSignal(options.signal);
  const manifest = parseOfflinePackManifest(payload.manifest);
  if (manifest.scope.subjectId !== subjectId || manifest.packId !== `subject-${subjectId}`) {
    throw new Error("OFFLINE_MANIFEST_SCOPE_MISMATCH");
  }
  return {
    ...identity,
    manifest,
    unavailableQuestions:
      typeof payload.unavailableQuestions === "number" &&
      Number.isSafeInteger(payload.unavailableQuestions)
        ? Math.max(0, payload.unavailableQuestions)
        : 0,
    omitted:
      typeof payload.omitted === "number" && Number.isSafeInteger(payload.omitted)
        ? Math.max(0, payload.omitted)
        : 0,
  };
}

/** Metadata only; no content bytes are fetched until the student starts the download. */
export async function prepareOfflineSubjectPack(
  subjectId: string,
  options: OfflineDownloadRequest,
) {
  const { manifest, omitted, unavailableQuestions } =
    await fetchOfflineSubjectPackManifestWithIdentity(subjectId, options);
  return { manifest, omitted, unavailableQuestions };
}

export async function fetchOfflineSubjectPackManifest(
  subjectId: string,
  onAvailability?: (unavailableQuestions: number) => void,
  options: OfflineDownloadRequest = {},
): Promise<OfflinePackManifest> {
  const result = await fetchOfflineSubjectPackManifestWithIdentity(subjectId, options);
  onAvailability?.(result.unavailableQuestions);
  return result.manifest;
}

/** Bound inactivity, not file size: slow downloads stay alive while bytes arrive. */
export async function fetchOfflineArtifactWithDeadline(
  io: OfflinePackDownloadIo,
  artifact: OfflinePackArtifact,
  signal?: AbortSignal,
  onProgress?: (loaded: number) => void,
  idleTimeoutMs = 45_000,
): Promise<Uint8Array> {
  checkDownloadSignal(signal);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let lastLoaded = 0;
  let rejectDeadline: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const abort = () => {
    rejectDeadline(new Error("OFFLINE_DOWNLOAD_ABORTED"));
    controller.abort();
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      rejectDeadline(new Error("OFFLINE_ARTIFACT_TIMEOUT"));
      controller.abort();
    }, idleTimeoutMs);
  };
  signal?.addEventListener("abort", abort, { once: true });
  arm();
  try {
    return await Promise.race([
      io.fetch(artifact, controller.signal, (loaded) => {
        if (controller.signal.aborted) return;
        if (loaded > lastLoaded) {
          lastLoaded = loaded;
          arm();
        }
        onProgress?.(loaded);
      }),
      deadline,
    ]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

export async function downloadOfflinePackManifest(params: {
  ownerId: string;
  manifest: OfflinePackManifest;
  repository?: OfflineStateRepository;
  io: OfflinePackDownloadIo;
  signal?: AbortSignal;
  onProgress?: (progress: OfflinePackDownloadProgress) => void;
}): Promise<OfflinePackRecord> {
  const repository = params.repository ?? deviceOfflineStateRepository;
  const manifest = parseOfflinePackManifest(params.manifest);
  checkDownloadSignal(params.signal);
  const registered = await registerOfflinePack(repository, params.ownerId, manifest);
  await startOfflinePackDownload(
    repository,
    params.ownerId,
    manifest.packId,
    registered.manifestSha256,
  );

  const totalBytes = manifest.artifacts.reduce((sum, artifact) => sum + artifact.byteSize, 0);
  let completedBytes = 0;
  let completedFiles = 0;
  let activeDownloads = 0;
  let networkBytes = 0;
  let lastProgressAt = 0;
  const startedAt = performance.now();
  const inFlight = new Map<number, number>();
  const recoverableFailures = new Set<unknown>();
  const controller = new AbortController();
  const abort = () => controller.abort();
  params.signal?.addEventListener("abort", abort, { once: true });
  if (params.signal?.aborted) abort();
  const emit = (progress: OfflinePackDownloadProgress) => {
    if (controller.signal.aborted) return;
    const now = performance.now();
    if (progress.status === "downloading" && now - lastProgressAt < 100) return;
    lastProgressAt = now;
    params.onProgress?.({
      ...progress,
      loadedBytes: Math.min(
        totalBytes,
        completedBytes + [...inFlight.values()].reduce((a, b) => a + b, 0),
      ),
      activeDownloads,
      verifiedBytes: completedBytes,
      verifiedFiles: completedFiles,
      bytesPerSecond: networkBytes / Math.max(1, (now - startedAt) / 1000),
    });
  };
  const processArtifact = async (index: number) => {
    const artifact = manifest.artifacts[index];
    let local: Uint8Array | null = null;
    try {
      local = await params.io.read(params.ownerId, artifact);
    } catch {
      local = null;
    }
    if (local) {
      try {
        await verifyOfflineArtifact(local, artifact);
      } catch {
        local = null;
      }
    }
    checkDownloadSignal(controller.signal);
    if (local) {
      await recordVerifiedOfflineArtifact(repository, {
        ownerId: params.ownerId,
        packId: manifest.packId,
        manifestSha256: registered.manifestSha256,
        artifactId: artifact.artifactId,
        observedSha256: artifact.sha256,
        observedBytes: artifact.byteSize,
      });
      completedBytes += artifact.byteSize;
      completedFiles += 1;
      emit({
        artifactId: artifact.artifactId,
        artifactIndex: index,
        artifactCount: manifest.artifacts.length,
        loadedBytes: completedBytes,
        totalBytes,
        status: "cached",
      });
      return;
    }

    await invalidateOfflineArtifact(repository, {
      ownerId: params.ownerId,
      packId: manifest.packId,
      manifestSha256: registered.manifestSha256,
      artifactId: artifact.artifactId,
    });

    emit({
      artifactId: artifact.artifactId,
      artifactIndex: index,
      artifactCount: manifest.artifacts.length,
      loadedBytes: completedBytes,
      totalBytes,
      status: "downloading",
    });
    activeDownloads += 1;
    let bytes: Uint8Array;
    try {
      bytes = await fetchOfflineArtifactWithDeadline(
        params.io,
        artifact,
        controller.signal,
        (loaded) => {
          const bounded = Math.max(0, Math.min(loaded, artifact.byteSize));
          const previous = inFlight.get(index) ?? 0;
          networkBytes += Math.max(0, bounded - previous);
          inFlight.set(index, Math.max(previous, bounded));
          emit({
            artifactId: artifact.artifactId,
            artifactIndex: index,
            artifactCount: manifest.artifacts.length,
            loadedBytes: completedBytes + Math.min(loaded, artifact.byteSize),
            totalBytes,
            status: "downloading",
          });
        },
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (
        error instanceof TypeError ||
        /^(OFFLINE_ARTIFACT_TIMEOUT|OFFLINE_ARTIFACT_DOWNLOAD_(429|502|503|504))$/.test(code)
      )
        recoverableFailures.add(error);
      throw error;
    } finally {
      activeDownloads -= 1;
    }
    checkDownloadSignal(controller.signal);
    emit({
      artifactId: artifact.artifactId,
      artifactIndex: index,
      artifactCount: manifest.artifacts.length,
      loadedBytes: 0,
      totalBytes,
      status: "verifying",
    });
    await verifyOfflineArtifact(bytes, artifact);
    checkDownloadSignal(controller.signal);
    emit({
      artifactId: artifact.artifactId,
      artifactIndex: index,
      artifactCount: manifest.artifacts.length,
      loadedBytes: 0,
      totalBytes,
      status: "saving",
    });
    await params.io.save(params.ownerId, artifact, bytes);
    const persisted = await params.io.read(params.ownerId, artifact);
    if (!persisted) throw new Error("OFFLINE_ARTIFACT_PERSISTENCE_FAILED");
    await verifyOfflineArtifact(persisted, artifact);
    checkDownloadSignal(controller.signal);
    await recordVerifiedOfflineArtifact(repository, {
      ownerId: params.ownerId,
      packId: manifest.packId,
      manifestSha256: registered.manifestSha256,
      artifactId: artifact.artifactId,
      observedSha256: artifact.sha256,
      observedBytes: artifact.byteSize,
    });
    inFlight.delete(index);
    completedBytes += artifact.byteSize;
    completedFiles += 1;
    emit({
      artifactId: artifact.artifactId,
      artifactIndex: index,
      artifactCount: manifest.artifacts.length,
      loadedBytes: completedBytes,
      totalBytes,
      status: "verified",
    });
  };
  let nextIndex = 0;
  let failure: unknown;
  let failed = false;
  const worker = async () => {
    while (!controller.signal.aborted && nextIndex < manifest.artifacts.length) {
      const index = nextIndex++;
      try {
        await processArtifact(index);
      } catch (error) {
        inFlight.delete(index);
        if (!failed) {
          failed = true;
          failure = error;
        }
        // Defer only transport failures from fetch, not storage/verification errors.
        if (!recoverableFailures.delete(error)) {
          if (!controller.signal.aborted) failure = error;
          controller.abort();
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, manifest.artifacts.length) }, worker));
    if (failed) throw failure;
    checkDownloadSignal(params.signal);
  } catch (error) {
    const code = error instanceof Error ? error.message : "OFFLINE_DOWNLOAD_FAILED";
    await markOfflinePackFailed(repository, params.ownerId, manifest.packId, code);
    throw error;
  } finally {
    params.signal?.removeEventListener("abort", abort);
  }

  const snapshot = await repository.read();
  const record = snapshot.packs.find(
    (candidate) =>
      candidate.ownerId === params.ownerId && candidate.manifest.packId === manifest.packId,
  );
  if (!record || record.status !== "ready") throw new Error("OFFLINE_PACK_NOT_READY");
  return record;
}

export async function downloadOfflineSubjectPack(params: {
  subjectId: string;
  expectedOwnerId?: string;
  /** Reuse the exact size/content preview without fetching its manifest again. */
  manifest?: OfflinePackManifest;
  repository?: OfflineStateRepository;
  signal?: AbortSignal;
  onProgress?: (progress: OfflinePackDownloadProgress) => void;
}): Promise<OfflinePackRecord> {
  const { ownerId, manifest } = params.manifest
    ? { ...(await checkedIdentity(params)), manifest: parseOfflinePackManifest(params.manifest) }
    : await fetchOfflineSubjectPackManifestWithIdentity(params.subjectId, params);
  if (
    manifest.scope.subjectId !== params.subjectId ||
    manifest.packId !== `subject-${params.subjectId}`
  ) {
    throw new Error("OFFLINE_MANIFEST_SCOPE_MISMATCH");
  }
  const record = await downloadOfflinePackManifest({
    ownerId,
    manifest,
    repository: params.repository,
    io: createDeviceIo(ownerId),
    signal: params.signal,
    onProgress: params.onProgress,
  });
  await checkedIdentity({ expectedOwnerId: ownerId, signal: params.signal });
  return record;
}

export type OfflineSubjectPackLocalStatus = {
  ownerId: string;
  record: OfflinePackRecord | null;
  presentArtifactIds: ReadonlySet<string>;
  presentBytes: number;
  totalBytes: number;
  ready: boolean;
};

export async function inspectOfflineSubjectPack(
  subjectId: string,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  signal?: AbortSignal,
): Promise<OfflineSubjectPackLocalStatus> {
  const ownerId = await sessionOwnerId(signal);
  const snapshot = await repository.read();
  const record =
    snapshot.packs.find(
      (candidate) =>
        candidate.ownerId === ownerId && candidate.manifest.packId === `subject-${subjectId}`,
    ) ?? null;
  if (!record) {
    return {
      ownerId,
      record: null,
      presentArtifactIds: new Set(),
      presentBytes: 0,
      totalBytes: 0,
      ready: false,
    };
  }

  const io = createDeviceIo("");
  const presentArtifactIds = new Set<string>();
  let presentBytes = 0;
  for (const artifact of record.manifest.artifacts) {
    checkDownloadSignal(signal);
    let bytes: Uint8Array | null = null;
    try {
      bytes = await io.read(ownerId, artifact);
      if (bytes) await verifyOfflineArtifact(bytes, artifact);
    } catch {
      bytes = null;
    }
    if (bytes) {
      presentArtifactIds.add(artifact.artifactId);
      presentBytes += artifact.byteSize;
    } else if (
      record.status !== "corrupt" &&
      record.status !== "stale" &&
      record.verifiedArtifactIds.includes(artifact.artifactId)
    ) {
      await invalidateOfflineArtifact(repository, {
        ownerId,
        packId: record.manifest.packId,
        manifestSha256: record.manifestSha256,
        artifactId: artifact.artifactId,
      });
    }
  }

  const refreshed = (await repository.read()).packs.find(
    (candidate) =>
      candidate.ownerId === ownerId && candidate.manifest.packId === record.manifest.packId,
  );
  const effectiveRecord = refreshed ?? record;
  return {
    ownerId,
    record: effectiveRecord,
    presentArtifactIds,
    presentBytes,
    totalBytes: record.manifest.artifacts.reduce((sum, artifact) => sum + artifact.byteSize, 0),
    ready:
      effectiveRecord.status === "ready" &&
      presentArtifactIds.size === record.manifest.artifacts.length,
  };
}

export async function deleteOfflineSubjectPack(
  subjectId: string,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  expectedOwnerId?: string,
): Promise<void> {
  const status = await inspectOfflineSubjectPack(subjectId, repository);
  if (expectedOwnerId && status.ownerId !== expectedOwnerId)
    throw new Error("OFFLINE_OWNER_CHANGED");
  if (!status.record) return;
  for (const artifact of status.record.manifest.artifacts) {
    if (artifact.kind === "textbook-pdf" || artifact.kind === "lesson-pdf") {
      await removeFile(artifact.resourceId);
    } else {
      await removeOfflineArtifact(status.ownerId, artifact);
    }
  }
  await removeOfflinePackRecord(repository, status.ownerId, status.record.manifest.packId);
}

export async function getRecordedOfflinePackBytes(
  repository: OfflineStateRepository = deviceOfflineStateRepository,
): Promise<number> {
  const ownerId = await sessionOwnerId();
  const snapshot = await repository.read();
  return snapshot.packs
    .filter((record) => record.ownerId === ownerId)
    .reduce((sum, record) => sum + record.downloadedBytes, 0);
}

export async function deleteAllOfflinePacks(
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  expectedOwnerId?: string,
): Promise<void> {
  const ownerId = await sessionOwnerId();
  if (expectedOwnerId && ownerId !== expectedOwnerId) throw new Error("OFFLINE_OWNER_CHANGED");
  const snapshot = await repository.read();
  const records = snapshot.packs.filter((record) => record.ownerId === ownerId);
  const removedFiles = new Set<string>();
  for (const record of records) {
    for (const artifact of record.manifest.artifacts) {
      const fileKey =
        artifact.kind === "textbook-pdf" || artifact.kind === "lesson-pdf"
          ? `pdf:${artifact.resourceId}`
          : `artifact:${artifact.relativePath}`;
      if (removedFiles.has(fileKey)) continue;
      removedFiles.add(fileKey);
      if (artifact.kind === "textbook-pdf" || artifact.kind === "lesson-pdf") {
        await removeFile(artifact.resourceId);
      } else {
        await removeOfflineArtifact(ownerId, artifact);
      }
    }
    await removeOfflinePackRecord(repository, ownerId, record.manifest.packId);
  }
}
