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
  status: "cached" | "downloading" | "verified";
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

async function sessionIdentity(): Promise<{ ownerId: string; token: string }> {
  const { data } = await supabase.auth.getSession();
  const ownerId = data.session?.user.id;
  const token = data.session?.access_token;
  if (!ownerId || !token) throw new Error("OFFLINE_UNAUTHENTICATED");
  return { ownerId, token };
}

async function sessionOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
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

function createDeviceIo(token: string): OfflinePackDownloadIo {
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
      const response = await fetch(artifactEndpoint(artifact), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok) throw new Error(`OFFLINE_ARTIFACT_DOWNLOAD_${response.status}`);
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
        return;
      }
      await saveOfflineArtifactBytes(ownerId, artifact, bytes);
    },
  };
}

async function fetchOfflineSubjectPackManifestWithIdentity(
  subjectId: string,
): Promise<{ ownerId: string; token: string; manifest: OfflinePackManifest }> {
  const identity = await sessionIdentity();
  const response = await fetch(`/api/offline-pack/manifest/${encodeURIComponent(subjectId)}`, {
    headers: { Authorization: `Bearer ${identity.token}` },
  });
  if (!response.ok) throw new Error(`OFFLINE_MANIFEST_FETCH_${response.status}`);
  const payload = (await response.json()) as { manifest?: unknown };
  return {
    ...identity,
    manifest: parseOfflinePackManifest(payload.manifest),
  };
}

export async function fetchOfflineSubjectPackManifest(
  subjectId: string,
): Promise<OfflinePackManifest> {
  return (await fetchOfflineSubjectPackManifestWithIdentity(subjectId)).manifest;
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
  const registered = await registerOfflinePack(repository, params.ownerId, manifest);
  await startOfflinePackDownload(
    repository,
    params.ownerId,
    manifest.packId,
    registered.manifestSha256,
  );

  const totalBytes = manifest.artifacts.reduce((sum, artifact) => sum + artifact.byteSize, 0);
  let completedBytes = 0;
  try {
    for (let index = 0; index < manifest.artifacts.length; index += 1) {
      if (params.signal?.aborted) throw new Error("OFFLINE_DOWNLOAD_ABORTED");
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
      if (local) {
        completedBytes += artifact.byteSize;
        await recordVerifiedOfflineArtifact(repository, {
          ownerId: params.ownerId,
          packId: manifest.packId,
          manifestSha256: registered.manifestSha256,
          artifactId: artifact.artifactId,
          observedSha256: artifact.sha256,
          observedBytes: artifact.byteSize,
        });
        params.onProgress?.({
          artifactId: artifact.artifactId,
          artifactIndex: index,
          artifactCount: manifest.artifacts.length,
          loadedBytes: completedBytes,
          totalBytes,
          status: "cached",
        });
        continue;
      }

      await invalidateOfflineArtifact(repository, {
        ownerId: params.ownerId,
        packId: manifest.packId,
        manifestSha256: registered.manifestSha256,
        artifactId: artifact.artifactId,
      });

      params.onProgress?.({
        artifactId: artifact.artifactId,
        artifactIndex: index,
        artifactCount: manifest.artifacts.length,
        loadedBytes: completedBytes,
        totalBytes,
        status: "downloading",
      });
      const bytes = await params.io.fetch(artifact, params.signal, (loaded) => {
        params.onProgress?.({
          artifactId: artifact.artifactId,
          artifactIndex: index,
          artifactCount: manifest.artifacts.length,
          loadedBytes: completedBytes + Math.min(loaded, artifact.byteSize),
          totalBytes,
          status: "downloading",
        });
      });
      await verifyOfflineArtifact(bytes, artifact);
      await params.io.save(params.ownerId, artifact, bytes);
      const persisted = await params.io.read(params.ownerId, artifact);
      if (!persisted) throw new Error("OFFLINE_ARTIFACT_PERSISTENCE_FAILED");
      await verifyOfflineArtifact(persisted, artifact);
      completedBytes += artifact.byteSize;
      await recordVerifiedOfflineArtifact(repository, {
        ownerId: params.ownerId,
        packId: manifest.packId,
        manifestSha256: registered.manifestSha256,
        artifactId: artifact.artifactId,
        observedSha256: artifact.sha256,
        observedBytes: artifact.byteSize,
      });
      params.onProgress?.({
        artifactId: artifact.artifactId,
        artifactIndex: index,
        artifactCount: manifest.artifacts.length,
        loadedBytes: completedBytes,
        totalBytes,
        status: "verified",
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "OFFLINE_DOWNLOAD_FAILED";
    await markOfflinePackFailed(repository, params.ownerId, manifest.packId, code);
    throw error;
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
  repository?: OfflineStateRepository;
  signal?: AbortSignal;
  onProgress?: (progress: OfflinePackDownloadProgress) => void;
}): Promise<OfflinePackRecord> {
  const { ownerId, token, manifest } = await fetchOfflineSubjectPackManifestWithIdentity(
    params.subjectId,
  );
  return downloadOfflinePackManifest({
    ownerId,
    manifest,
    repository: params.repository,
    io: createDeviceIo(token),
    signal: params.signal,
    onProgress: params.onProgress,
  });
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
): Promise<OfflineSubjectPackLocalStatus> {
  const ownerId = await sessionOwnerId();
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
): Promise<void> {
  const status = await inspectOfflineSubjectPack(subjectId, repository);
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
): Promise<void> {
  const ownerId = await sessionOwnerId();
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
