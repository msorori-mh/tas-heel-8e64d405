import {
  digestOfflinePackManifest,
  sha256Hex,
  type OfflinePackManifest,
} from "../../src/lib/offline/offline-pack-contract";
import type { OfflineSubjectPackLocalStatus } from "../../src/lib/offline/offline-pack-downloader";
type PreparedSubject = {
  id: string;
  name: string;
  manifest: OfflinePackManifest;
  manifestSha256: string;
  omitted: number;
};
type SavedSubject = { id: string; name: string; local: OfflineSubjectPackLocalStatus };
export const scope = { ownerId: "student-a", gradeId: "grade-12", trackId: "track-a" };
export async function prepared(id = "one", name = "الرياضيات"): Promise<PreparedSubject> {
  const manifest: OfflinePackManifest = {
    schemaVersion: 1,
    packId: `subject-${id}`,
    revision: 1,
    generatedAt: "2026-09-13T00:00:00.000Z",
    scope: {
      gradeId: scope.gradeId,
      curriculumTrackId: scope.trackId,
      semester: id === "two" ? 2 : 1,
      subjectId: id,
      subjectTitle: name,
    },
    artifacts: [
      {
        artifactId: `official-book:${id}`,
        kind: "lesson-html",
        resourceId: `official-book:${id}`,
        lessonId: `lesson-${id}`,
        lessonTitle: "درس تجريبي",
        title: name,
        relativePath: `packs/${id}.html`,
        contentType: "text/html",
        byteSize: 3,
        sha256: await sha256Hex(new TextEncoder().encode("abc")),
        sortOrder: 0,
      },
    ],
  };
  return {
    id,
    name,
    manifest,
    manifestSha256: await digestOfflinePackManifest(manifest),
    omitted: 0,
  };
}
export function savedSubject(subject: PreparedSubject, ready = true): SavedSubject {
  const record = {
    ownerId: scope.ownerId,
    manifest: subject.manifest,
    manifestSha256: subject.manifestSha256,
    status: ready ? ("ready" as const) : ("failed" as const),
    verifiedArtifactIds: ready ? subject.manifest.artifacts.map((a) => a.artifactId) : [],
    downloadedBytes: ready ? 3 : 0,
    lastErrorCode: null,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
  };
  return {
    id: subject.id,
    name: subject.name,
    local: {
      ownerId: scope.ownerId,
      record,
      presentArtifactIds: new Set(record.verifiedArtifactIds),
      presentBytes: record.downloadedBytes,
      totalBytes: 3,
      ready,
    },
  };
}
