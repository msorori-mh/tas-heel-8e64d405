import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
  readableOfflinePacks,
} from "../../src/lib/offline/offline-state-store";
import {
  enqueueOfflineMutation,
  claimOfflineMutations,
  markOfflineMutationDelivered,
  markOfflineMutationFailed,
} from "../../src/lib/offline/offline-outbox";
import { syncOfflineOutbox } from "../../src/lib/offline/offline-sync";
import { createOfflineSyncScheduler } from "../../src/lib/offline/offline-sync-scheduler";
import { downloadOfflinePackManifest } from "../../src/lib/offline/offline-pack-downloader";
import { sha256Hex, type OfflinePackManifest } from "../../src/lib/offline/offline-pack-contract";

const T0 = "2026-09-01T00:00:00.000Z";
const T1 = "2026-09-01T00:00:01.000Z";
afterEach(() => vi.useRealTimers());
async function enqueue(repository: OfflineStateRepository, count = 1, ownerId = "student-a") {
  for (let index = 0; index < count; index++) {
    await enqueueOfflineMutation(
      repository,
      {
        ownerId,
        kind: "lesson-progress",
        entityId: "lesson-1",
        idempotencyKey: "offline-recovery-operation-" + index,
        occurredAt: T0,
        progressPercent: index % 101,
      },
      T0,
    );
  }
}

describe("offline recovery and concurrency", () => {
  it("preserves independent writes from repositories sharing one device store", async () => {
    const adapter = new MemoryOfflineStateAdapter();
    const first = new OfflineStateRepository(adapter);
    const second = new OfflineStateRepository(adapter);
    await Promise.all([enqueue(first, 1, "student-a"), enqueue(second, 1, "student-b")]);
    const restored = await new OfflineStateRepository(adapter).read();
    expect(restored.outbox.map((item) => item.ownerId).sort()).toEqual(["student-a", "student-b"]);
    expect(restored.revision).toBe(2);
  });

  it("drains more than the old 20-item batch without sending another account", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await enqueue(repository, 45);
    await enqueue(repository, 1, "student-b");
    const delivered: string[] = [];
    expect(
      await syncOfflineOutbox({
        repository,
        ownerId: "student-a",
        now: T0,
        delivery: {
          async deliver(record) {
            delivered.push(record.id);
          },
        },
      }),
    ).toEqual({ claimed: 45, delivered: 45, failed: 0 });
    expect(new Set(delivered).size).toBe(45);
    expect(
      (await repository.read()).outbox.filter((item) => item.status === "pending"),
    ).toHaveLength(1);
  });

  it("keeps later operations pending after network failure and retries after restart", async () => {
    const adapter = new MemoryOfflineStateAdapter();
    const repository = new OfflineStateRepository(adapter);
    await enqueue(repository, 3);
    await syncOfflineOutbox({
      repository,
      ownerId: "student-a",
      now: T0,
      delivery: {
        async deliver() {
          throw new Error("NETWORK");
        },
      },
    });
    expect((await repository.read()).outbox.map((record) => record.attempts)).toEqual([1, 0, 0]);
    const restored = new OfflineStateRepository(adapter);
    const result = await syncOfflineOutbox({
      repository: restored,
      ownerId: "student-a",
      now: T1,
      delivery: { async deliver() {} },
    });
    expect(result.delivered).toBe(3);
  });

  it("ignores stale lease callbacks and never changes delivered work back to failed", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await enqueue(repository);
    const [first] = await claimOfflineMutations(repository, "student-a", {
      now: T0,
      leaseMs: 1000,
    });
    const [second] = await claimOfflineMutations(repository, "student-a", { now: T1 });
    await markOfflineMutationFailed(repository, "student-a", first.id, "LATE", T1, first.attempts);
    expect((await repository.read()).outbox[0].status).toBe("processing");
    await markOfflineMutationDelivered(repository, "student-a", second.id, T1, second.attempts);
    await markOfflineMutationFailed(repository, "student-a", first.id, "LATE", T1);
    expect((await repository.read()).outbox[0].status).toBe("delivered");
  });

  it("stops taking new work when an owner/session change aborts the run", async () => {
    const repository = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await enqueue(repository, 3);
    const controller = new AbortController();
    const result = await syncOfflineOutbox({
      repository,
      ownerId: "student-a",
      now: T0,
      signal: controller.signal,
      delivery: {
        async deliver() {
          controller.abort();
        },
      },
    });
    expect(result.delivered).toBe(1);
    expect(
      (await repository.read()).outbox.filter((record) => record.status === "pending"),
    ).toHaveLength(2);
  });

  it("retains the installed pack after an interrupted update and switches only after verification", async () => {
    const adapter = new MemoryOfflineStateAdapter();
    let repository = new OfflineStateRepository(adapter);
    const encoder = new TextEncoder();
    const a = encoder.encode("old");
    const b = encoder.encode("new");
    const manifest: OfflinePackManifest = {
      schemaVersion: 1,
      packId: "subject-one",
      revision: 1,
      generatedAt: T0,
      scope: { gradeId: "12", curriculumTrackId: null, semester: 1, subjectId: "one" },
      artifacts: [
        {
          artifactId: "one",
          resourceId: "official-book:one",
          kind: "lesson-html",
          lessonId: "lesson-1",
          title: "درس",
          relativePath: "one.html",
          contentType: "text/html",
          byteSize: a.length,
          sha256: await sha256Hex(a),
          sortOrder: 0,
        },
      ],
    };
    const bytes = new Map<string, Uint8Array>();
    const io = {
      async read(_owner: string, artifact: { sha256: string }) {
        return bytes.get(artifact.sha256) ?? null;
      },
      async save(_owner: string, artifact: { sha256: string }, value: Uint8Array) {
        bytes.set(artifact.sha256, value);
      },
      async fetch() {
        return a;
      },
    };
    await downloadOfflinePackManifest({ repository, ownerId: "student-a", manifest, io });
    const next = {
      ...manifest,
      revision: 2,
      artifacts: [{ ...manifest.artifacts[0], sha256: await sha256Hex(b) }],
    };
    await expect(
      downloadOfflinePackManifest({
        repository,
        ownerId: "student-a",
        manifest: next,
        io: {
          ...io,
          async fetch() {
            throw new Error("NETWORK");
          },
        },
      }),
    ).rejects.toThrow("NETWORK");
    repository = new OfflineStateRepository(adapter);
    expect(readableOfflinePacks(await repository.read())[0].manifest.revision).toBe(1);
    expect(bytes.get(manifest.artifacts[0].sha256)).toEqual(a);
    await downloadOfflinePackManifest({
      repository,
      ownerId: "student-a",
      manifest: next,
      io: {
        ...io,
        async fetch() {
          return b;
        },
      },
    });
    expect(readableOfflinePacks(await repository.read())[0].manifest.revision).toBe(2);
  });
});

describe("foreground sync scheduler", () => {
  it("drains consecutive batches, retries without a new online event, and stops cleanly", async () => {
    vi.useFakeTimers();
    const sync = vi
      .fn()
      .mockResolvedValueOnce({ claimed: 100, delivered: 100, failed: 0 })
      .mockResolvedValueOnce({ claimed: 1, delivered: 0, failed: 1 })
      .mockResolvedValue({ claimed: 1, delivered: 1, failed: 0 });
    const scheduler = createOfflineSyncScheduler({ sync, canSync: () => true });
    scheduler.wake();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sync).toHaveBeenCalledTimes(3);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it("does not overlap wakes or run while offline", async () => {
    vi.useFakeTimers();
    let connected = false;
    let release!: (value: { claimed: number; delivered: number; failed: number }) => void;
    const sync = vi.fn(
      () =>
        new Promise<{ claimed: number; delivered: number; failed: number }>((resolve) => {
          release = resolve;
        }),
    );
    const scheduler = createOfflineSyncScheduler({ sync, canSync: () => connected });
    scheduler.wake();
    expect(sync).not.toHaveBeenCalled();
    connected = true;
    scheduler.wake();
    scheduler.wake();
    expect(sync).toHaveBeenCalledTimes(1);
    scheduler.stop();
    release({ claimed: 0, delivered: 0, failed: 0 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
