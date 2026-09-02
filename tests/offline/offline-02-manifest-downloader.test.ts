import { describe, expect, it } from "vitest";

import {
  buildOfflineSubjectPack,
  type OfflinePackBuildInput,
} from "../../src/lib/offline/offline-pack-manifest";
import {
  sha256Hex,
  type OfflinePackArtifact,
  type OfflinePackManifest,
} from "../../src/lib/offline/offline-pack-contract";
import {
  downloadOfflinePackManifest,
  type OfflinePackDownloadIo,
} from "../../src/lib/offline/offline-pack-downloader";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
} from "../../src/lib/offline/offline-state-store";

const UUIDS = {
  subject: "00000000-0000-4000-8000-000000000001",
  lesson: "00000000-0000-4000-8000-000000000002",
  book: "00000000-0000-4000-8000-000000000003",
  explanation: "00000000-0000-4000-8000-000000000004",
  summary: "00000000-0000-4000-8000-000000000005",
  experiment: "00000000-0000-4000-8000-000000000006",
  textbook: "00000000-0000-4000-8000-000000000007",
};
const T0 = "2026-09-01T00:00:00.000Z";
const T1 = "2026-09-01T00:00:01.000Z";
const T2 = "2026-09-01T00:00:02.000Z";
const encoder = new TextEncoder();

async function hash(value: string): Promise<string> {
  return sha256Hex(encoder.encode(value));
}

async function buildInput(): Promise<OfflinePackBuildInput> {
  const official = '<article dir="rtl">المحتوى الرسمي</article>';
  const experiment =
    '<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width"></head><body>تجربة آمنة</body></html>';
  return {
    subjectTitle: "الكيمياء",
    scope: {
      gradeId: "grade-12",
      curriculumTrackId: "sanaa",
      semester: 1,
      subjectId: UUIDS.subject,
    },
    lessons: [
      {
        id: UUIDS.lesson,
        title: "الكيمياء",
        sortOrder: 2,
        updatedAt: T0,
        managed: true,
        visible: true,
        readyCapabilities: {
          officialBookContent: { sha256: await hash(official), readyAt: T1 },
          simulation: { sha256: await hash(experiment), readyAt: T2 },
        },
      },
    ],
    textSources: [
      {
        sourceType: "tamkeen-explanation",
        sourceId: UUIDS.explanation,
        lessonId: UUIDS.lesson,
        title: "شرح غير جاهز",
        body: '<article dir="rtl">مسودة</article>',
        updatedAt: T0,
        sortOrder: 0,
        attestation: "lifecycle",
      },
      {
        sourceType: "lab-experiment",
        sourceId: UUIDS.experiment,
        lessonId: UUIDS.lesson,
        title: "التجربة",
        body: experiment,
        updatedAt: T2,
        sortOrder: 5,
        attestation: "body",
        bodySha256: await hash(experiment),
      },
      {
        sourceType: "official-book",
        sourceId: UUIDS.book,
        lessonId: UUIDS.lesson,
        title: "الكتاب الرسمي",
        body: official,
        updatedAt: T1,
        sortOrder: 0,
        attestation: "lifecycle",
      },
    ],
    textbooks: [
      {
        sourceId: UUIDS.textbook,
        title: "كتاب الكيمياء",
        byteSize: 3,
        sha256: await hash("pdf"),
        updatedAt: T1,
        sortOrder: 0,
      },
    ],
  };
}

describe("OFFLINE-02 deterministic manifest", () => {
  it("includes READY self-contained content and attested books in stable order", async () => {
    const input = await buildInput();
    const first = await buildOfflineSubjectPack(input);
    const second = await buildOfflineSubjectPack({
      ...input,
      textSources: [...input.textSources].reverse(),
    });

    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.artifacts.map((artifact) => artifact.artifactId)).toEqual([
      `official-book:${UUIDS.book}`,
      `lab-experiment:${UUIDS.experiment}`,
      `textbook:${UUIDS.textbook}`,
    ]);
    expect(first.omissions).toContainEqual({
      sourceId: UUIDS.explanation,
      code: "CAPABILITY_NOT_READY",
    });
    expect(first.manifest.revision).toBe(Date.parse(T2));
    expect(first.manifest.generatedAt).toBe(T2);
  });

  it("fails closed on answer leakage or a changed READY body", async () => {
    const input = await buildInput();
    await expect(
      buildOfflineSubjectPack({
        ...input,
        textSources: input.textSources.map((source) =>
          source.sourceType === "official-book"
            ? { ...source, body: '<div data-answer="1">x</div>' }
            : source,
        ),
      }),
    ).rejects.toThrow("OFFLINE_ANSWER_LEAK_DETECTED");

    await expect(
      buildOfflineSubjectPack({
        ...input,
        textSources: input.textSources.map((source) =>
          source.sourceType === "official-book"
            ? { ...source, body: `${source.body} changed` }
            : source,
        ),
      }),
    ).rejects.toThrow("OFFLINE_SOURCE_READY_HASH_MISMATCH");
  });

  it("omits remote-dependent HTML and unattested textbooks", async () => {
    const input = await buildInput();
    const result = await buildOfflineSubjectPack({
      ...input,
      textSources: input.textSources.map((source) =>
        source.sourceType === "official-book"
          ? {
              ...source,
              body: '<article dir="rtl"><img src="https://example.test/a.png"></article>',
            }
          : source,
      ),
      textbooks: input.textbooks.map((textbook) => ({ ...textbook, sha256: "" })),
    });
    expect(result.manifest.artifacts).toHaveLength(1);
    expect(result.manifest.artifacts[0].artifactId).toBe(`lab-experiment:${UUIDS.experiment}`);
    expect(result.omissions.map((omission) => omission.code)).toEqual(
      expect.arrayContaining(["REMOTE_DEPENDENCY", "TEXTBOOK_ATTESTATION_MISSING"]),
    );
  });
});

async function manifestForDownload(
  revision = 1,
  secondBytes = "def",
): Promise<OfflinePackManifest> {
  const artifacts: OfflinePackArtifact[] = await Promise.all(
    [
      ["one", "abc"],
      ["two", secondBytes],
    ].map(async ([id, body], index) => ({
      artifactId: id,
      kind: "lesson-html" as const,
      resourceId: `official-book:${id}`,
      lessonId: "lesson-1",
      title: id,
      relativePath: `packs/subject/${id}.html`,
      contentType: "text/html; charset=utf-8",
      byteSize: encoder.encode(body).byteLength,
      sha256: await hash(body),
      sortOrder: index,
    })),
  );
  return {
    schemaVersion: 1,
    packId: "subject-1",
    revision,
    generatedAt: new Date(revision * 1_000).toISOString(),
    scope: {
      gradeId: "grade-12",
      curriculumTrackId: null,
      semester: 1,
      subjectId: "subject-1",
    },
    artifacts,
  };
}

class MemoryIo implements OfflinePackDownloadIo {
  readonly files = new Map<string, Uint8Array>();
  readonly fetches = new Map<string, number>();
  failOnceFor: string | null = null;

  constructor(readonly bodies: Record<string, string>) {}

  async read(ownerId: string, artifact: OfflinePackArtifact) {
    return this.files.get(`${ownerId}:${artifact.artifactId}`) ?? null;
  }

  async fetch(artifact: OfflinePackArtifact) {
    const count = (this.fetches.get(artifact.artifactId) ?? 0) + 1;
    this.fetches.set(artifact.artifactId, count);
    if (this.failOnceFor === artifact.artifactId) {
      this.failOnceFor = null;
      throw new Error("NETWORK_ONCE");
    }
    return encoder.encode(this.bodies[artifact.artifactId]);
  }

  async save(ownerId: string, artifact: OfflinePackArtifact, bytes: Uint8Array) {
    this.files.set(`${ownerId}:${artifact.artifactId}`, Uint8Array.from(bytes));
  }
}

describe("OFFLINE-02 resumable differential downloader", () => {
  it("resumes at the failed file, replays idempotently, and only fetches changed bytes", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const io = new MemoryIo({ one: "abc", two: "def" });
    const firstManifest = await manifestForDownload();
    io.failOnceFor = "two";

    await expect(
      downloadOfflinePackManifest({
        ownerId: "student-a",
        manifest: firstManifest,
        repository,
        io,
      }),
    ).rejects.toThrow("NETWORK_ONCE");
    const partial = (await repository.read()).packs[0];
    expect(partial.verifiedArtifactIds).toEqual(["one"]);
    expect(partial.downloadedBytes).toBe(3);

    const ready = await downloadOfflinePackManifest({
      ownerId: "student-a",
      manifest: firstManifest,
      repository,
      io,
    });
    expect(ready.status).toBe("ready");
    expect(io.fetches.get("one")).toBe(1);
    expect(io.fetches.get("two")).toBe(2);

    await downloadOfflinePackManifest({
      ownerId: "student-a",
      manifest: firstManifest,
      repository,
      io,
    });
    expect(io.fetches.get("one")).toBe(1);
    expect(io.fetches.get("two")).toBe(2);

    io.bodies.two = "ghi";
    const changed = await manifestForDownload(2, "ghi");
    const updated = await downloadOfflinePackManifest({
      ownerId: "student-a",
      manifest: changed,
      repository,
      io,
    });
    expect(updated.status).toBe("ready");
    expect(io.fetches.get("one")).toBe(1);
    expect(io.fetches.get("two")).toBe(3);
  });

  it("never marks corrupt fetched bytes ready", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const io = new MemoryIo({ one: "xxx", two: "def" });
    await expect(
      downloadOfflinePackManifest({
        ownerId: "student-a",
        manifest: await manifestForDownload(),
        repository,
        io,
      }),
    ).rejects.toThrow("OFFLINE_ARTIFACT_HASH_MISMATCH");
    expect((await repository.read()).packs[0].status).toBe("failed");
  });

  it("revokes READY state when a local file disappeared and its retry fails", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const io = new MemoryIo({ one: "abc", two: "def" });
    const manifest = await manifestForDownload();
    await downloadOfflinePackManifest({
      ownerId: "student-a",
      manifest,
      repository,
      io,
    });
    io.files.delete("student-a:two");
    io.failOnceFor = "two";

    await expect(
      downloadOfflinePackManifest({
        ownerId: "student-a",
        manifest,
        repository,
        io,
      }),
    ).rejects.toThrow("NETWORK_ONCE");
    const record = (await repository.read()).packs[0];
    expect(record.status).toBe("failed");
    expect(record.verifiedArtifactIds).toEqual(["one"]);
    expect(record.downloadedBytes).toBe(3);
  });
});
