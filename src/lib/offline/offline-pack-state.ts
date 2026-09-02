/** OFFLINE-01 — fail-closed pack lifecycle over the durable state journal. */

import {
  digestOfflinePackManifest,
  parseOfflinePackManifest,
  type OfflinePackManifest,
} from "./offline-pack-contract";
import {
  OfflineStateRepository,
  type OfflinePackRecord,
  type OfflineStateSnapshot,
} from "./offline-state-store";

function packKey(ownerId: string, packId: string): string {
  return `${ownerId}\u0000${packId}`;
}

function findPack(snapshot: OfflineStateSnapshot, ownerId: string, packId: string) {
  const expected = packKey(ownerId, packId);
  return snapshot.packs.find(
    (record) => packKey(record.ownerId, record.manifest.packId) === expected,
  );
}

export async function registerOfflinePack(
  repository: OfflineStateRepository,
  ownerId: string,
  input: unknown,
  now = new Date().toISOString(),
): Promise<OfflinePackRecord> {
  const manifest = parseOfflinePackManifest(input);
  const manifestSha256 = await digestOfflinePackManifest(manifest);
  return repository.update((snapshot) => {
    const current = findPack(snapshot, ownerId, manifest.packId);
    if (current) {
      if (manifest.revision < current.manifest.revision) {
        throw new Error("OFFLINE_PACK_REVISION_STALE");
      }
      if (manifest.revision === current.manifest.revision) {
        if (manifestSha256 !== current.manifestSha256) {
          throw new Error("OFFLINE_PACK_REVISION_CONFLICT");
        }
        return current;
      }
      current.status = "stale";
      current.updatedAt = now;
    }

    const carriedArtifactIds = current
      ? manifest.artifacts
          .filter((artifact) => {
            if (!current.verifiedArtifactIds.includes(artifact.artifactId)) return false;
            const previous = current.manifest.artifacts.find(
              (candidate) => candidate.artifactId === artifact.artifactId,
            );
            return (
              previous?.sha256 === artifact.sha256 &&
              previous.byteSize === artifact.byteSize &&
              previous.relativePath === artifact.relativePath
            );
          })
          .map((artifact) => artifact.artifactId)
      : [];
    const carriedBytes = manifest.artifacts
      .filter((artifact) => carriedArtifactIds.includes(artifact.artifactId))
      .reduce((sum, artifact) => sum + artifact.byteSize, 0);

    const record: OfflinePackRecord = {
      ownerId,
      manifest,
      manifestSha256,
      status: carriedArtifactIds.length === manifest.artifacts.length ? "ready" : "registered",
      verifiedArtifactIds: carriedArtifactIds,
      downloadedBytes: carriedBytes,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    snapshot.packs = snapshot.packs.filter(
      (candidate) =>
        packKey(candidate.ownerId, candidate.manifest.packId) !== packKey(ownerId, manifest.packId),
    );
    snapshot.packs.push(record);
    return record;
  }, now);
}

export async function startOfflinePackDownload(
  repository: OfflineStateRepository,
  ownerId: string,
  packId: string,
  manifestSha256: string,
  now = new Date().toISOString(),
): Promise<OfflinePackRecord> {
  return repository.update((snapshot) => {
    const record = findPack(snapshot, ownerId, packId);
    if (!record) throw new Error("OFFLINE_PACK_NOT_REGISTERED");
    if (record.manifestSha256 !== manifestSha256) throw new Error("OFFLINE_PACK_DIGEST_MISMATCH");
    if (record.status === "corrupt" || record.status === "stale") {
      throw new Error("OFFLINE_PACK_STATE_BLOCKED");
    }
    if (record.status !== "ready") record.status = "downloading";
    record.lastErrorCode = null;
    record.updatedAt = now;
    return record;
  }, now);
}

export async function recordVerifiedOfflineArtifact(
  repository: OfflineStateRepository,
  input: {
    ownerId: string;
    packId: string;
    manifestSha256: string;
    artifactId: string;
    observedSha256: string;
    observedBytes: number;
  },
  now = new Date().toISOString(),
): Promise<OfflinePackRecord> {
  const result = await repository.update((snapshot) => {
    const record = findPack(snapshot, input.ownerId, input.packId);
    if (!record) throw new Error("OFFLINE_PACK_NOT_REGISTERED");
    if (record.manifestSha256 !== input.manifestSha256) {
      throw new Error("OFFLINE_PACK_DIGEST_MISMATCH");
    }
    const artifact = record.manifest.artifacts.find(
      (candidate) => candidate.artifactId === input.artifactId,
    );
    if (!artifact) throw new Error("OFFLINE_ARTIFACT_NOT_DECLARED");
    if (artifact.sha256 !== input.observedSha256 || artifact.byteSize !== input.observedBytes) {
      record.status = "corrupt";
      record.lastErrorCode = "OFFLINE_ARTIFACT_ATTESTATION_MISMATCH";
      record.updatedAt = now;
      return { record, mismatch: true };
    }
    if (!record.verifiedArtifactIds.includes(artifact.artifactId)) {
      record.verifiedArtifactIds.push(artifact.artifactId);
      record.downloadedBytes += artifact.byteSize;
    }
    record.status =
      record.verifiedArtifactIds.length === record.manifest.artifacts.length
        ? "ready"
        : "downloading";
    record.lastErrorCode = null;
    record.updatedAt = now;
    return { record, mismatch: false };
  }, now);
  if (result.mismatch) throw new Error("OFFLINE_ARTIFACT_ATTESTATION_MISMATCH");
  return result.record;
}

export async function invalidateOfflineArtifact(
  repository: OfflineStateRepository,
  input: {
    ownerId: string;
    packId: string;
    manifestSha256: string;
    artifactId: string;
  },
  now = new Date().toISOString(),
): Promise<void> {
  await repository.update((snapshot) => {
    const record = findPack(snapshot, input.ownerId, input.packId);
    if (!record) throw new Error("OFFLINE_PACK_NOT_REGISTERED");
    if (record.manifestSha256 !== input.manifestSha256) {
      throw new Error("OFFLINE_PACK_DIGEST_MISMATCH");
    }
    const artifact = record.manifest.artifacts.find(
      (candidate) => candidate.artifactId === input.artifactId,
    );
    if (!artifact) throw new Error("OFFLINE_ARTIFACT_NOT_DECLARED");
    if (record.verifiedArtifactIds.includes(artifact.artifactId)) {
      record.verifiedArtifactIds = record.verifiedArtifactIds.filter(
        (artifactId) => artifactId !== artifact.artifactId,
      );
      record.downloadedBytes = Math.max(0, record.downloadedBytes - artifact.byteSize);
    }
    record.status = "downloading";
    record.lastErrorCode = null;
    record.updatedAt = now;
  }, now);
}

export async function markOfflinePackFailed(
  repository: OfflineStateRepository,
  ownerId: string,
  packId: string,
  errorCode: string,
  now = new Date().toISOString(),
): Promise<void> {
  await repository.update((snapshot) => {
    const record = findPack(snapshot, ownerId, packId);
    if (!record) throw new Error("OFFLINE_PACK_NOT_REGISTERED");
    if (record.status === "ready" || record.status === "corrupt") return;
    record.status = "failed";
    record.lastErrorCode = errorCode.slice(0, 120);
    record.updatedAt = now;
  }, now);
}

export async function removeOfflinePackRecord(
  repository: OfflineStateRepository,
  ownerId: string,
  packId: string,
  now = new Date().toISOString(),
): Promise<OfflinePackRecord | null> {
  return repository.update((snapshot) => {
    const record = findPack(snapshot, ownerId, packId) ?? null;
    snapshot.packs = snapshot.packs.filter(
      (candidate) =>
        packKey(candidate.ownerId, candidate.manifest.packId) !== packKey(ownerId, packId),
    );
    return record;
  }, now);
}

export function totalOfflinePackBytes(manifest: OfflinePackManifest): number {
  return manifest.artifacts.reduce((sum, artifact) => sum + artifact.byteSize, 0);
}
