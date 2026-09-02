/** OFFLINE-01 — durable, account-isolated metadata journal. */

import { Capacitor } from "@capacitor/core";
import { z } from "zod";

import { offlinePackManifestSchema } from "./offline-pack-contract";

export const OFFLINE_STATE_SCHEMA_VERSION = 1 as const;
export const OFFLINE_STATE_DB_NAME = "tamkeen-offline-foundation";
export const OFFLINE_STATE_NATIVE_DIR = "tamkeen/offline";
export const OFFLINE_STATE_NATIVE_PATH = `${OFFLINE_STATE_NATIVE_DIR}/foundation-v1.json`;
export const OFFLINE_STATE_NATIVE_BACKUP_PATH = `${OFFLINE_STATE_NATIVE_DIR}/foundation-v1.backup.json`;

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
    updatedAt: isoDate,
    activeOwnerId: z.string().min(1).max(160).nullable().default(null),
    packs: z.array(offlinePackRecordSchema),
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
}

export function emptyOfflineState(now = new Date().toISOString()): OfflineStateSnapshot {
  return {
    schemaVersion: OFFLINE_STATE_SCHEMA_VERSION,
    updatedAt: now,
    activeOwnerId: null,
    packs: [],
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
    });
  }
}

class NativeOfflineStateAdapter implements OfflineStateAdapter {
  private async filesystem() {
    const module = await import("@capacitor/filesystem");
    return {
      Filesystem: module.Filesystem,
      Directory: module.Directory,
      Encoding: module.Encoding,
    };
  }

  private async readPath(path: string): Promise<unknown | null> {
    let raw: string;
    try {
      const { Filesystem, Directory, Encoding } = await this.filesystem();
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      if (typeof result.data !== "string") return null;
      raw = result.data;
    } catch {
      return null;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error("OFFLINE_STATE_FILE_CORRUPT");
    }
  }

  async read(): Promise<unknown | null> {
    let primary: unknown | null = null;
    let backup: unknown | null = null;
    let invalid = false;
    try {
      primary = await this.readPath(OFFLINE_STATE_NATIVE_PATH);
      if (offlineStateSnapshotSchema.safeParse(primary).success) return primary;
      invalid = primary !== null;
    } catch {
      invalid = true;
    }
    try {
      backup = await this.readPath(OFFLINE_STATE_NATIVE_BACKUP_PATH);
      if (offlineStateSnapshotSchema.safeParse(backup).success) return backup;
      invalid = invalid || backup !== null;
    } catch {
      invalid = true;
    }
    if (!invalid) return null;
    throw new Error("OFFLINE_STATE_CORRUPT");
  }

  async write(value: OfflineStateSnapshot): Promise<void> {
    const { Filesystem, Directory, Encoding } = await this.filesystem();
    try {
      await Filesystem.mkdir({
        path: OFFLINE_STATE_NATIVE_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch {
      // The private directory already exists.
    }
    const current = await this.read();
    if (current) {
      await Filesystem.writeFile({
        path: OFFLINE_STATE_NATIVE_BACKUP_PATH,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        data: JSON.stringify(current),
      });
    }
    await Filesystem.writeFile({
      path: OFFLINE_STATE_NATIVE_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(value),
    });
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
      const snapshot = await this.read();
      const result = await operation(snapshot);
      snapshot.updatedAt = now;
      const validated = offlineStateSnapshotSchema.parse(snapshot);
      await this.adapter.write(validated);
      return result;
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

/** Shared runtime instance; prevents competing read-modify-write queues in one WebView. */
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
