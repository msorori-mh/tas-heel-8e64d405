/** OFFLINE-03 — reconstruct verified lesson components from private pack bytes. */

import { readOfflineArtifactBytes } from "./offline-artifact-cache";
import { verifyOfflineArtifact, type OfflinePackArtifact } from "./offline-pack-contract";
import { parseOfflineTextResourceId } from "./offline-pack-manifest";
import { deviceOfflineStateRepository, type OfflineStateRepository } from "./offline-state-store";

export type OfflineLessonTextItem = {
  artifactId: string;
  sourceId: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type OfflineLessonContent = {
  lessonTitle: string | null;
  subjectId: string | null;
  subjectTitle: string | null;
  gradeId: string | null;
  curriculumTrackId: string | null;
  officialBook: OfflineLessonTextItem | null;
  explanations: OfflineLessonTextItem[];
  summaries: OfflineLessonTextItem[];
  mindMaps: OfflineLessonTextItem[];
  experiments: OfflineLessonTextItem[];
};

export function emptyOfflineLessonContent(): OfflineLessonContent {
  return {
    lessonTitle: null,
    subjectId: null,
    subjectTitle: null,
    gradeId: null,
    curriculumTrackId: null,
    officialBook: null,
    explanations: [],
    summaries: [],
    mindMaps: [],
    experiments: [],
  };
}

export async function readOfflineLessonContent(
  ownerId: string,
  lessonId: string,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  readBytes: (
    ownerId: string,
    artifact: OfflinePackArtifact,
  ) => Promise<Uint8Array | null> = readOfflineArtifactBytes,
): Promise<OfflineLessonContent> {
  const snapshot = await repository.read();
  const packs = snapshot.packs
    .filter((record) => record.ownerId === ownerId)
    .sort((left, right) => right.manifest.revision - left.manifest.revision);
  const result = emptyOfflineLessonContent();
  const seen = new Set<string>();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const pack of packs) {
    for (const artifact of pack.manifest.artifacts) {
      if (artifact.lessonId === lessonId && !result.lessonTitle) {
        result.lessonTitle = artifact.lessonTitle ?? artifact.title;
        result.subjectId = pack.manifest.scope.subjectId;
        result.subjectTitle = pack.manifest.scope.subjectTitle ?? null;
        result.gradeId = pack.manifest.scope.gradeId;
        result.curriculumTrackId = pack.manifest.scope.curriculumTrackId;
      }
      if (
        artifact.lessonId !== lessonId ||
        !pack.verifiedArtifactIds.includes(artifact.artifactId) ||
        seen.has(artifact.artifactId) ||
        (artifact.kind !== "lesson-html" && artifact.kind !== "quick-review")
      ) {
        continue;
      }
      let parsed: ReturnType<typeof parseOfflineTextResourceId>;
      try {
        parsed = parseOfflineTextResourceId(artifact.resourceId);
      } catch {
        continue;
      }
      const bytes = await readBytes(ownerId, artifact);
      if (!bytes) continue;
      try {
        await verifyOfflineArtifact(bytes, artifact);
      } catch {
        continue;
      }
      let body: string;
      try {
        body = decoder.decode(bytes);
      } catch {
        continue;
      }
      const item: OfflineLessonTextItem = {
        artifactId: artifact.artifactId,
        sourceId: parsed.sourceId,
        title: artifact.title,
        body,
        sortOrder: artifact.sortOrder,
      };
      seen.add(artifact.artifactId);
      if (parsed.sourceType === "official-book" && !result.officialBook) {
        result.officialBook = item;
      } else if (parsed.sourceType === "tamkeen-explanation") {
        result.explanations.push(item);
      } else if (parsed.sourceType === "quick-review") {
        result.summaries.push(item);
      } else if (parsed.sourceType === "mind-map") {
        result.mindMaps.push(item);
      } else if (parsed.sourceType === "lab-experiment") {
        result.experiments.push(item);
      }
    }
  }

  for (const items of [
    result.explanations,
    result.summaries,
    result.mindMaps,
    result.experiments,
  ]) {
    items.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.sourceId.localeCompare(right.sourceId),
    );
  }
  return result;
}
