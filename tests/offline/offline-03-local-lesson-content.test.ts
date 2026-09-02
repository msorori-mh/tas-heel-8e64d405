import { describe, expect, it } from "vitest";

import { readOfflineLessonContent } from "../../src/lib/offline/offline-lesson-content";
import { sha256Hex, type OfflinePackManifest } from "../../src/lib/offline/offline-pack-contract";
import {
  recordVerifiedOfflineArtifact,
  registerOfflinePack,
} from "../../src/lib/offline/offline-pack-state";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
} from "../../src/lib/offline/offline-state-store";

const T0 = "2026-09-01T00:00:00.000Z";
const encoder = new TextEncoder();

async function manifest(): Promise<{
  value: OfflinePackManifest;
  bodies: Map<string, Uint8Array>;
}> {
  const sources = [
    ["official-book:book-1", "lesson-html", "المحتوى الرسمي"],
    ["tamkeen-explanation:explanation-1", "lesson-html", "شرح تمكين"],
    ["quick-review:summary-1", "quick-review", "ملخص الدرس"],
    ["mind-map:mind-1", "lesson-html", '<html dir="rtl">خريطة</html>'],
    ["lab-experiment:lab-1", "lesson-html", '<html dir="rtl">تجربة</html>'],
  ] as const;
  const bodies = new Map<string, Uint8Array>();
  const artifacts = await Promise.all(
    sources.map(async ([artifactId, kind, body], index) => {
      const bytes = encoder.encode(body);
      bodies.set(artifactId, bytes);
      return {
        artifactId,
        kind,
        resourceId: artifactId,
        lessonId: "lesson-1",
        title: `عنصر ${index + 1}`,
        relativePath: `packs/subject/${index}.html`,
        contentType: "text/html; charset=utf-8",
        byteSize: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        sortOrder: index,
      };
    }),
  );
  return {
    bodies,
    value: {
      schemaVersion: 1,
      packId: "subject-1",
      revision: 1,
      generatedAt: T0,
      scope: {
        gradeId: "grade-12",
        curriculumTrackId: null,
        semester: 1,
        subjectId: "subject-1",
      },
      artifacts,
    },
  };
}

describe("OFFLINE-03 verified local lesson reconstruction", () => {
  it("reconstructs only verified artifacts for the active owner", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const fixture = await manifest();
    const registered = await registerOfflinePack(repository, "student-a", fixture.value, T0);
    for (const artifact of fixture.value.artifacts.slice(0, 4)) {
      await recordVerifiedOfflineArtifact(
        repository,
        {
          ownerId: "student-a",
          packId: fixture.value.packId,
          manifestSha256: registered.manifestSha256,
          artifactId: artifact.artifactId,
          observedSha256: artifact.sha256,
          observedBytes: artifact.byteSize,
        },
        T0,
      );
    }

    const read = async (_ownerId: string, artifact: { artifactId: string }) =>
      fixture.bodies.get(artifact.artifactId) ?? null;
    const local = await readOfflineLessonContent("student-a", "lesson-1", repository, read);
    expect(local.officialBook?.body).toBe("المحتوى الرسمي");
    expect(local.explanations.map((item) => item.body)).toEqual(["شرح تمكين"]);
    expect(local.summaries.map((item) => item.body)).toEqual(["ملخص الدرس"]);
    expect(local.mindMaps).toHaveLength(1);
    expect(local.experiments).toEqual([]);

    const otherOwner = await readOfflineLessonContent("student-b", "lesson-1", repository, read);
    expect(otherOwner.officialBook).toBeNull();
    expect(otherOwner.explanations).toEqual([]);
  });

  it("drops corrupt local bytes even when stale metadata says verified", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const fixture = await manifest();
    const registered = await registerOfflinePack(repository, "student-a", fixture.value, T0);
    const artifact = fixture.value.artifacts[0];
    await recordVerifiedOfflineArtifact(
      repository,
      {
        ownerId: "student-a",
        packId: fixture.value.packId,
        manifestSha256: registered.manifestSha256,
        artifactId: artifact.artifactId,
        observedSha256: artifact.sha256,
        observedBytes: artifact.byteSize,
      },
      T0,
    );
    const local = await readOfflineLessonContent("student-a", "lesson-1", repository, async () =>
      encoder.encode("tampered bytes"),
    );
    expect(local.officialBook).toBeNull();
  });
});
