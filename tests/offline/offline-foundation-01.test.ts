import { describe, expect, it } from "vitest";

import {
  canonicalizeOfflinePackManifest,
  digestOfflinePackManifest,
  parseOfflinePackManifest,
  sha256Hex,
  verifyOfflineArtifact,
  type OfflinePackManifest,
} from "../../src/lib/offline/offline-pack-contract";
import {
  recordVerifiedOfflineArtifact,
  registerOfflinePack,
  startOfflinePackDownload,
} from "../../src/lib/offline/offline-pack-state";
import {
  claimOfflineMutations,
  enqueueOfflineMutation,
  markOfflineMutationDelivered,
  markOfflineMutationFailed,
} from "../../src/lib/offline/offline-outbox";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
  type OfflineStateAdapter,
  type OfflineStateSnapshot,
  setActiveOfflineOwner,
} from "../../src/lib/offline/offline-state-store";

const T0 = "2026-09-01T00:00:00.000Z";
const T1 = "2026-09-01T00:00:01.000Z";
const T2 = "2026-09-01T00:00:02.000Z";
const ABC_SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const DEF_SHA = "cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34";

function manifest(overrides: Partial<OfflinePackManifest> = {}): OfflinePackManifest {
  return {
    schemaVersion: 1,
    packId: "grade-12-semester-1-chemistry",
    revision: 1,
    generatedAt: T0,
    scope: {
      gradeId: "grade-12",
      curriculumTrackId: "sanaa",
      semester: 1,
      subjectId: "chemistry",
    },
    artifacts: [
      {
        artifactId: "lesson-1-html",
        kind: "lesson-html",
        resourceId: "resource-1",
        lessonId: "lesson-1",
        title: "الدرس الأول",
        relativePath: "packs/chemistry/lesson-1.html",
        contentType: "text/html",
        byteSize: 3,
        sha256: ABC_SHA,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

describe("OFFLINE-01 manifest contract", () => {
  it("canonicalizes key order and produces a stable SHA-256", async () => {
    const input = manifest();
    const reordered = {
      artifacts: input.artifacts,
      scope: input.scope,
      generatedAt: input.generatedAt,
      revision: input.revision,
      packId: input.packId,
      schemaVersion: input.schemaVersion,
    };
    expect(canonicalizeOfflinePackManifest(reordered)).toBe(canonicalizeOfflinePackManifest(input));
    expect(await digestOfflinePackManifest(reordered)).toBe(await digestOfflinePackManifest(input));
  });

  it("rejects URLs, path traversal, unknown fields and duplicate paths", () => {
    expect(() =>
      parseOfflinePackManifest({
        ...manifest(),
        signedUrl: "https://example.test/temporary-token",
      }),
    ).toThrow();
    expect(() =>
      parseOfflinePackManifest({
        ...manifest(),
        artifacts: [{ ...manifest().artifacts[0], relativePath: "../escape.html" }],
      }),
    ).toThrow();
    expect(() =>
      parseOfflinePackManifest({
        ...manifest(),
        artifacts: [
          manifest().artifacts[0],
          {
            ...manifest().artifacts[0],
            artifactId: "lesson-2-html",
            resourceId: "resource-2",
          },
        ],
      }),
    ).toThrow(/OFFLINE_ARTIFACT_PATH_DUPLICATE/);
  });

  it("verifies exact bytes and fails closed on corruption", async () => {
    const artifact = manifest().artifacts[0];
    await expect(verifyOfflineArtifact(new TextEncoder().encode("abc"), artifact)).resolves.toBe(
      undefined,
    );
    await expect(verifyOfflineArtifact(new TextEncoder().encode("abd"), artifact)).rejects.toThrow(
      "OFFLINE_ARTIFACT_HASH_MISMATCH",
    );
    await expect(verifyOfflineArtifact(new TextEncoder().encode("ab"), artifact)).rejects.toThrow(
      "OFFLINE_ARTIFACT_SIZE_MISMATCH",
    );
  });
});

describe("OFFLINE-01 pack lifecycle", () => {
  it("persists one active owner and clears it on sign-out", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await setActiveOfflineOwner("student-a", repository);
    expect((await repository.read()).activeOwnerId).toBe("student-a");
    await setActiveOfflineOwner(null, repository);
    expect((await repository.read()).activeOwnerId).toBeNull();
  });

  it("registers idempotently, survives repository recreation and reaches ready once", async () => {
    const adapter = new MemoryOfflineStateAdapter();
    const firstRepository = new OfflineStateRepository(adapter);
    const first = await registerOfflinePack(firstRepository, "student-a", manifest(), T0);
    const replay = await registerOfflinePack(firstRepository, "student-a", manifest(), T0);
    expect(replay.manifestSha256).toBe(first.manifestSha256);

    const secondRepository = new OfflineStateRepository(adapter);
    await startOfflinePackDownload(
      secondRepository,
      "student-a",
      manifest().packId,
      first.manifestSha256,
      T1,
    );
    await recordVerifiedOfflineArtifact(
      secondRepository,
      {
        ownerId: "student-a",
        packId: manifest().packId,
        manifestSha256: first.manifestSha256,
        artifactId: "lesson-1-html",
        observedSha256: ABC_SHA,
        observedBytes: 3,
      },
      T2,
    );
    const replayVerification = await recordVerifiedOfflineArtifact(
      secondRepository,
      {
        ownerId: "student-a",
        packId: manifest().packId,
        manifestSha256: first.manifestSha256,
        artifactId: "lesson-1-html",
        observedSha256: ABC_SHA,
        observedBytes: 3,
      },
      T2,
    );
    expect(replayVerification.status).toBe("ready");
    expect(replayVerification.downloadedBytes).toBe(3);
    expect(replayVerification.verifiedArtifactIds).toEqual(["lesson-1-html"]);
  });

  it("rejects conflicting content at the same revision", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await registerOfflinePack(repository, "student-a", manifest(), T0);
    await expect(
      registerOfflinePack(repository, "student-a", manifest({ generatedAt: T1 }), T1),
    ).rejects.toThrow("OFFLINE_PACK_REVISION_CONFLICT");
  });

  it("persists corrupt state when observed attestation differs", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const record = await registerOfflinePack(repository, "student-a", manifest(), T0);
    await expect(
      recordVerifiedOfflineArtifact(
        repository,
        {
          ownerId: "student-a",
          packId: manifest().packId,
          manifestSha256: record.manifestSha256,
          artifactId: "lesson-1-html",
          observedSha256: DEF_SHA,
          observedBytes: 3,
        },
        T1,
      ),
    ).rejects.toThrow("OFFLINE_ARTIFACT_ATTESTATION_MISMATCH");
    expect((await repository.read()).packs[0].status).toBe("corrupt");
  });
});

describe("OFFLINE-01 outbox", () => {
  const input = {
    ownerId: "student-a",
    idempotencyKey: "lesson-1-progress-20260901",
    kind: "lesson-progress" as const,
    entityId: "lesson-1",
    occurredAt: T0,
    progressPercent: 40,
  };

  it("deduplicates replays and isolates accounts", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const first = await enqueueOfflineMutation(repository, input, T0);
    const replay = await enqueueOfflineMutation(repository, input, T1);
    await enqueueOfflineMutation(repository, { ...input, ownerId: "student-b" }, T1);
    expect(replay.id).toBe(first.id);
    expect((await repository.read()).outbox).toHaveLength(2);
    expect(await claimOfflineMutations(repository, "student-a", { now: T1 })).toHaveLength(1);
    expect(await claimOfflineMutations(repository, "student-c", { now: T1 })).toEqual([]);
  });

  it("fails closed when a reused idempotency key has different payload", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await enqueueOfflineMutation(repository, input, T0);
    await expect(
      enqueueOfflineMutation(repository, { ...input, progressPercent: 80 }, T1),
    ).rejects.toThrow("OFFLINE_OUTBOX_IDEMPOTENCY_CONFLICT");
  });

  it("backs off failures, reclaims expired leases and keeps delivered tombstones", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    const queued = await enqueueOfflineMutation(repository, input, T0);
    const [claimed] = await claimOfflineMutations(repository, "student-a", {
      now: T0,
      leaseMs: 1_000,
    });
    expect(claimed.attempts).toBe(1);
    expect(await claimOfflineMutations(repository, "student-a", { now: T0 })).toEqual([]);

    await markOfflineMutationFailed(repository, "student-a", queued.id, "NETWORK", T0);
    expect(await claimOfflineMutations(repository, "student-a", { now: T0 })).toEqual([]);
    const [retry] = await claimOfflineMutations(repository, "student-a", { now: T1 });
    expect(retry.attempts).toBe(2);
    await markOfflineMutationDelivered(repository, "student-a", retry.id, T2);
    expect(await claimOfflineMutations(repository, "student-a", { now: T2 })).toEqual([]);
    const replay = await enqueueOfflineMutation(repository, input, T2);
    expect(replay.status).toBe("delivered");
  });

  it("fails closed on invalid persisted state without overwriting queued activity", async () => {
    const invalidAdapter: OfflineStateAdapter = {
      async read() {
        return { schemaVersion: 1, packs: [{ token: "forbidden" }], outbox: [] };
      },
      async write(_value: OfflineStateSnapshot) {},
    };
    const repository = new OfflineStateRepository(invalidAdapter);
    await expect(repository.read()).rejects.toThrow("OFFLINE_STATE_CORRUPT");
    await expect(enqueueOfflineMutation(repository, input, T1)).rejects.toThrow(
      "OFFLINE_STATE_CORRUPT",
    );
  });
});

describe("OFFLINE-01 hash primitive", () => {
  it("matches the standard SHA-256 vector", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(ABC_SHA);
  });
});
