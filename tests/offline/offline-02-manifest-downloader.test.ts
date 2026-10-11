import { afterEach, describe, expect, it, vi } from "vitest";

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
  fetchOfflineArtifactWithDeadline,
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
      throw new TypeError("NETWORK_ONCE");
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

afterEach(() => vi.useRealTimers());

it("bounds parallel transfers to three and accounts for overlapping byte progress", async () => {
  const manifest = await manifestForDownload();
  manifest.artifacts = ["one", "two", "three", "four"].map((id, index) => ({
    ...manifest.artifacts[0],
    artifactId: id,
    resourceId: `official-book:${id}`,
    relativePath: `packs/subject/${id}.html`,
    sortOrder: index,
  }));
  const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
  const io = new MemoryIo(Object.fromEntries(manifest.artifacts.map((a) => [a.artifactId, "abc"])));
  const releases: (() => void)[] = [];
  let active = 0;
  let peak = 0;
  io.fetch = async (artifact, ...args: unknown[]) => {
    active++;
    peak = Math.max(peak, active);
    const progress = args[1] as ((loaded: number) => void) | undefined;
    progress?.(1);
    await new Promise<void>((resolve) => releases.push(resolve));
    progress?.(3);
    active--;
    return encoder.encode("abc");
  };
  const samples: number[] = [];
  const verifiedCounts: number[] = [];
  const done = downloadOfflinePackManifest({
    ownerId: "student-a",
    manifest,
    repository,
    io,
    onProgress: (p) => {
      samples.push(p.loadedBytes);
      verifiedCounts.push(p.verifiedFiles ?? 0);
    },
  });
  await vi.waitFor(() => expect(releases).toHaveLength(3));
  releases[1]();
  await vi.waitFor(() => expect(releases).toHaveLength(4));
  releases[3]();
  releases[2]();
  releases[0]();
  const record = await done;
  expect(peak).toBe(3);
  expect(record.verifiedArtifactIds).toHaveLength(4);
  expect(record.downloadedBytes).toBe(12);
  expect(samples.at(-1)).toBe(12);
  expect(verifiedCounts.at(-1)).toBe(4);
  expect(verifiedCounts.every((value, i) => i === 0 || value >= verifiedCounts[i - 1])).toBe(true);
  expect(samples.every((value, i) => value <= 12 && (i === 0 || value >= samples[i - 1]))).toBe(
    true,
  );
});

it("times out a stalled transfer, saves other files, and resumes only the missing file", async () => {
  const manifest = await manifestForDownload();
  const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
  const io = new MemoryIo({ one: "abc", two: "def" });
  const originalFetch = io.fetch.bind(io);
  let stalledSignal: AbortSignal | undefined;
  io.fetch = async (artifact, ...args: unknown[]) => {
    if (artifact.artifactId === "one") {
      stalledSignal = args[0] as AbortSignal;
      return new Promise<Uint8Array>(() => {});
    }
    return originalFetch(artifact);
  };
  vi.useFakeTimers();
  const failure = expect(
    downloadOfflinePackManifest({ ownerId: "student-a", manifest, repository, io }),
  ).rejects.toThrow("OFFLINE_ARTIFACT_TIMEOUT");
  await vi.waitFor(() => expect(stalledSignal).toBeDefined());
  await vi.runAllTimersAsync();
  await failure;
  expect(stalledSignal?.aborted).toBe(true);
  expect((await repository.read()).packs[0].verifiedArtifactIds).toEqual(["two"]);
  io.fetch = originalFetch;
  expect(
    (await downloadOfflinePackManifest({ ownerId: "student-a", manifest, repository, io })).status,
  ).toBe("ready");
  expect(io.fetches.get("two")).toBe(1);
});

it("keeps a slow active stream alive and cancels immediately on user abort", async () => {
  const artifact = (await manifestForDownload()).artifacts[0];
  const io = new MemoryIo({ one: "abc" });
  let progress: ((loaded: number) => void) | undefined;
  let finish: (bytes: Uint8Array) => void = () => {};
  io.fetch = async (_artifact, ...args: unknown[]) => {
    progress = args[1] as (loaded: number) => void;
    return new Promise<Uint8Array>((resolve) => {
      finish = resolve;
    });
  };
  vi.useFakeTimers();
  const done = fetchOfflineArtifactWithDeadline(io, artifact, undefined, undefined, 30);
  await vi.advanceTimersByTimeAsync(20);
  progress?.(1);
  await vi.advanceTimersByTimeAsync(20);
  progress?.(2);
  await vi.advanceTimersByTimeAsync(20);
  finish(encoder.encode("abc"));
  expect(await done).toEqual(encoder.encode("abc"));
  const controller = new AbortController();
  const canceled = expect(
    fetchOfflineArtifactWithDeadline(io, artifact, controller.signal),
  ).rejects.toThrow("OFFLINE_DOWNLOAD_ABORTED");
  controller.abort();
  await canceled;
});

it("aborts all active transfers without saving late bytes or claiming readiness", async () => {
  const manifest = await manifestForDownload();
  const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
  const io = new MemoryIo({ one: "abc", two: "def" });
  const signals: AbortSignal[] = [];
  const releases: (() => void)[] = [];
  io.fetch = async (artifact, ...args: unknown[]) => {
    signals.push(args[0] as AbortSignal);
    await new Promise<void>((resolve) => releases.push(resolve));
    return encoder.encode(io.bodies[artifact.artifactId]);
  };
  const controller = new AbortController();
  const aborted = expect(
    downloadOfflinePackManifest({
      ownerId: "student-a",
      manifest,
      repository,
      io,
      signal: controller.signal,
    }),
  ).rejects.toThrow("OFFLINE_DOWNLOAD_ABORTED");
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  controller.abort();
  await aborted;
  releases.forEach((resolve) => resolve());
  await Promise.resolve();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(io.files.size).toBe(0);
  expect((await repository.read()).packs[0].status).toBe("failed");
});
