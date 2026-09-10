/** OFFLINE-01 — durable, account-isolated metadata journal. */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { z } from "zod";

import { offlinePackManifestSchema } from "./offline-pack-contract";

export const OFFLINE_STATE_SCHEMA_VERSION = 1 as const;
export const OFFLINE_STATE_DB_NAME = "tamkeen-offline-foundation";

interface TamkeenOfflineStateNativePlugin {
  read(): Promise<{ snapshot: unknown | null }>;
  write(options: { snapshot: OfflineStateSnapshot }): Promise<void>;
  compareAndSwap(options: {
    snapshot: OfflineStateSnapshot;
    expectedRevision: number;
  }): Promise<{ committed: boolean }>;
}

const TamkeenOfflineState = registerPlugin<TamkeenOfflineStateNativePlugin>("TamkeenOfflineState");

const isoDate = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const offlinePackRecordSchema = z
  .object({
    ownerId: z.string().min(1).max(160),
    manifest: offlinePackManifestSchema,
    manifestSha256: sha256,
    status: z.enum(["registered", "downloading", "ready", "failed", "corrupt", "stale"]),
    verifiedArtifactIds: z.array(z.string().min(1).max(160)),
    downloadedBytes: z.number().int().nonnegative(),
    lastErrorCode: z.string().max(120).nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .strict();

export const offlineOutboxRecordSchema = z
  .object({
    id: z.string().min(1).max(100),
    ownerId: z.string().min(1).max(160),
    idempotencyKey: z.string().min(16).max(160),
    kind: z.enum(["lesson-progress", "lesson-completion", "official-question-note"]),
    entityId: z.string().min(1).max(160),
    lessonId: z.string().min(1).max(160).nullable().default(null),
    occurredAt: isoDate,
    progressPercent: z.number().min(0).max(100).nullable(),
    answerText: z.string().max(64_000).nullable().default(null),
    payloadSha256: sha256,
    status: z.enum(["pending", "processing", "delivered", "failed"]),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: isoDate,
    leaseUntil: isoDate.nullable(),
    lastErrorCode: z.string().max(120).nullable(),
    createdAt: isoDate,
    updatedAt: isoDate,
    deliveredAt: isoDate.nullable(),
  })
  .strict();

export const offlineLearningRecordSchema = z
  .object({
    id: z.string().min(1).max(520),
    ownerId: z.string().min(1).max(160),
    lessonId: z.string().min(1).max(160),
    questionId: z.string().min(1).max(160),
    revisionId: z.string().min(1).max(160).nullable(),
    kind: z.enum(["official-question-note", "self-test-attempt"]),
    answerText: z.string().max(64_000).nullable(),
    selectedOptionId: z.string().min(1).max(160).nullable(),
    isCorrect: z.boolean().nullable(),
    updatedAt: isoDate,
  })
  .strict();

export const offlineStateSnapshotSchema = z
  .object({
    schemaVersion: z.literal(OFFLINE_STATE_SCHEMA_VERSION),
    revision: z.number().int().nonnegative().default(0),
    updatedAt: isoDate,
    activeOwnerId: z.string().min(1).max(160).nullable().default(null),
    packs: z.array(offlinePackRecordSchema),
    packBackups: z.array(offlinePackRecordSchema).default([]),
    outbox: z.array(offlineOutboxRecordSchema),
    learning: z.array(offlineLearningRecordSchema).default([]),
  })
  .strict();

export type OfflinePackRecord = z.infer<typeof offlinePackRecordSchema>;
export type OfflineOutboxRecord = z.infer<typeof offlineOutboxRecordSchema>;
export type OfflineLearningRecord = z.infer<typeof offlineLearningRecordSchema>;
export type OfflineStateSnapshot = z.infer<typeof offlineStateSnapshotSchema>;

export interface OfflineStateAdapter {
  read(): Promise<unknown | null>;
  write(value: OfflineStateSnapshot): Promise<void>;
  compareAndSwap?(value: OfflineStateSnapshot, expectedRevision: number): Promise<boolean>;
}

export function emptyOfflineState(now = new Date().toISOString()): OfflineStateSnapshot {
  return {
    schemaVersion: OFFLINE_STATE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    activeOwnerId: null,
    packs: [],
    packBackups: [],
    outbox: [],
    learning: [],
  };
}

export class MemoryOfflineStateAdapter implements OfflineStateAdapter {
  private value: OfflineStateSnapshot | null = null;

  async read(): Promise<unknown | null> {
    return this.value ? structuredClone(this.value) : null;
  }

  async write(value: OfflineStateSnapshot): Promise<void> {
    this.value = structuredClone(value);
  }

  async compareAndSwap(value: OfflineStateSnapshot, expectedRevision: number): Promise<boolean> {
    if ((this.value?.revision ?? 0) !== expectedRevision) return false;
    this.value = structuredClone(value);
    return true;
  }
}

class IndexedDbOfflineStateAdapter implements OfflineStateAdapter {
  private database: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("OFFLINE_IDB_MISSING"));
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = indexedDB.open(OFFLINE_STATE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("snapshots")) {
            request.result.createObjectStore("snapshots");
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("OFFLINE_IDB_OPEN_FAILED"));
      });
    }
    return this.database;
  }

  async read(): Promise<unknown | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const request = database.transaction("snapshots", "readonly").objectStore("snapshots").get(1);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("OFFLINE_IDB_READ_FAILED"));
    });
  }

  async write(value: OfflineStateSnapshot): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(value, 1);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("OFFLINE_IDB_WRITE_FAILED"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("OFFLINE_IDB_WRITE_ABORTED"));
    });
  }

  async compareAndSwap(value: OfflineStateSnapshot, expectedRevision: number): Promise<boolean> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("snapshots", "readwrite");
      const store = tx.objectStore("snapshots");
      const request = store.get(1);
      let committed = false;
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) return;
        store.put(value, 1);
        committed = true;
      };
      tx.oncomplete = () => resolve(committed);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("OFFLINE_IDB_WRITE_FAILED"));
    });
  }
}

class NativeOfflineStateAdapter implements OfflineStateAdapter {
  async compareAndSwap(value: OfflineStateSnapshot, expectedRevision: number): Promise<boolean> {
    return (await TamkeenOfflineState.compareAndSwap({ snapshot: value, expectedRevision }))
      .committed;
  }

  async read(): Promise<unknown | null> {
    try {
      const result = await TamkeenOfflineState.read();
      return result.snapshot ?? null;
    } catch (error) {
      throw new Error("OFFLINE_STATE_NATIVE_READ_FAILED", { cause: error });
    }
  }

  async write(value: OfflineStateSnapshot): Promise<void> {
    try {
      await TamkeenOfflineState.write({ snapshot: value });
    } catch (error) {
      throw new Error("OFFLINE_STATE_NATIVE_WRITE_FAILED", { cause: error });
    }
  }
}

export function createDeviceOfflineStateAdapter(): OfflineStateAdapter {
  try {
    if (Capacitor.isNativePlatform()) return new NativeOfflineStateAdapter();
  } catch {
    // Fall through to origin-private IndexedDB.
  }
  return new IndexedDbOfflineStateAdapter();
}

export class OfflineStateRepository {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly adapter: OfflineStateAdapter = createDeviceOfflineStateAdapter()) {}

  async read(): Promise<OfflineStateSnapshot> {
    const raw = await this.adapter.read();
    if (raw === null) return emptyOfflineState();
    const parsed = offlineStateSnapshotSchema.safeParse(raw);
    if (!parsed.success) throw new Error("OFFLINE_STATE_CORRUPT");
    return parsed.data;
  }

  update<T>(
    operation: (snapshot: OfflineStateSnapshot) => Promise<T> | T,
    now = new Date().toISOString(),
  ): Promise<T> {
    const run = this.queue.then(async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const snapshot = await this.read();
        const expectedRevision = snapshot.revision;
        const result = await operation(snapshot);
        snapshot.updatedAt = now;
        snapshot.revision = expectedRevision + 1;
        const validated = offlineStateSnapshotSchema.parse(snapshot);
        if (this.adapter.compareAndSwap) {
          if (!(await this.adapter.compareAndSwap(validated, expectedRevision))) continue;
        } else {
          await this.adapter.write(validated);
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event("tamkeen-offline-state"));
        return result;
      }
      throw new Error("OFFLINE_STATE_WRITE_CONFLICT");
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

/** Prefer the installed revision until every artifact of its replacement is verified. */
export function readableOfflinePacks(snapshot: OfflineStateSnapshot): OfflinePackRecord[] {
  const ready = snapshot.packs.filter((record) => record.status === "ready");
  const keys = new Set(ready.map((record) => `${record.ownerId}\u0000${record.manifest.packId}`));
  return [
    ...ready,
    ...snapshot.packBackups.filter(
      (record) =>
        record.status === "ready" && !keys.has(`${record.ownerId}\u0000${record.manifest.packId}`),
    ),
  ];
}

/** Shared runtime instance; prevents competing queues in one WebView. */
export const deviceOfflineStateRepository = new OfflineStateRepository();

/**
 * Marks the account whose private downloads may be exposed by the bundled
 * Android offline entry. The value is never accepted from that local page.
 */
export async function setActiveOfflineOwner(
  ownerId: string | null,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
): Promise<void> {
  await repository.update((snapshot) => {
    snapshot.activeOwnerId = ownerId;
  });
}
