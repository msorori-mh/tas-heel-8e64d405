import { digestOfflinePackManifest } from "@/lib/offline/offline-pack-contract";
import {
  deviceOfflineStateRepository,
  type OfflineStateRepository,
} from "@/lib/offline/offline-state-store";

export type SubjectDownloadState = "downloaded" | "partial";

/** Report the verified download journal, without fetching or re-hashing every media file. */
export async function readSubjectDownloads(
  ownerId: string,
  semester: number,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
): Promise<Record<string, SubjectDownloadState>> {
  const state = await repository.read();
  if (state.activeOwnerId !== ownerId) return {};
  const result: Record<string, SubjectDownloadState> = {};
  for (const pack of state.packs) {
    const { scope, artifacts } = pack.manifest;
    if (
      pack.ownerId !== ownerId ||
      !scope.subjectId ||
      pack.manifest.packId !== `subject-${scope.subjectId}` ||
      (scope.semester !== null && scope.semester !== semester) ||
      pack.status === "corrupt" ||
      pack.status === "stale" ||
      !artifacts.length
    )
      continue;
    if ((await digestOfflinePackManifest(pack.manifest)) !== pack.manifestSha256) continue;
    const verified = new Set(pack.verifiedArtifactIds);
    if (!artifacts.some((artifact) => verified.has(artifact.artifactId))) continue;
    result[scope.subjectId] =
      pack.status === "ready" && artifacts.every((artifact) => verified.has(artifact.artifactId))
        ? "downloaded"
        : "partial";
  }
  // Do not return the previous account's device state after an in-flight account switch.
  return (await repository.read()).activeOwnerId === ownerId ? result : {};
}
