/**
 * 18C-3 — offline file cache for lesson PDFs.
 *
 * Bytes live in app-private storage:
 *   - native (Capacitor): Filesystem `Directory.Data` → not visible in the
 *     phone's file manager, removed when the app is uninstalled.
 *   - web: IndexedDB blob store (origin-private).
 *
 * Metadata lives in a durable index (IndexedDB, mirrored to localStorage) so a
 * cached file survives reloads and can be compared against the server version.
 */

import { Capacitor } from "@capacitor/core";

import { sha256Hex } from "./offline-pack-contract";

export type CachedFileEntry = {
  resourceId: string;
  lessonId: string | null;
  subjectId: string | null;
  localPath: string | null; // native only
  downloadedVersion: string;
  downloadedAt: number;
  fileSize: number;
  contentType: string;
  /** Observed bytes digest. Legacy entries may not have one. */
  contentSha256: string | null;
  lastOpenedPage: number;
  lastOpenedAt: number;
  pinnedOffline: boolean;
};

const DB_NAME = "tamkeen-offline";
const DB_VERSION = 1;
const BLOB_STORE = "pdf-blobs";
const META_STORE = "pdf-meta";
const NATIVE_DIR = "tamkeen/pdf";
/** Default LRU ceiling for non-pinned files (bytes). */
export const DEFAULT_CACHE_LIMIT_BYTES = 350 * 1024 * 1024;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* IndexedDB plumbing                                                  */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no_indexeddb"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
    });
  }
  return dbPromise;
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbAllMeta(): Promise<CachedFileEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META_STORE, "readonly").objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as CachedFileEntry[]);
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------------ */
/* Native filesystem plumbing                                          */
/* ------------------------------------------------------------------ */

async function nativeFs() {
  const mod = await import("@capacitor/filesystem");
  return { Filesystem: mod.Filesystem, Directory: mod.Directory, Encoding: mod.Encoding };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function getEntry(resourceId: string): Promise<CachedFileEntry | null> {
  try {
    return (await idbGet<CachedFileEntry>(META_STORE, resourceId)) ?? null;
  } catch {
    return null;
  }
}

export async function listEntries(): Promise<CachedFileEntry[]> {
  try {
    return await idbAllMeta();
  } catch {
    return [];
  }
}

export async function totalCachedBytes(): Promise<number> {
  const entries = await listEntries();
  return entries.reduce((sum, e) => sum + (e.fileSize || 0), 0);
}

export async function saveFile(params: {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  blob: Blob;
  version: string;
  contentType?: string;
  contentSha256?: string | null;
  pinnedOffline?: boolean;
}): Promise<CachedFileEntry> {
  const contentType = params.contentType || params.blob.type || "application/pdf";
  const previous = await getEntry(params.resourceId);
  let localPath: string | null = null;

  if (isNative()) {
    const { Filesystem, Directory } = await nativeFs();
    const path = `${NATIVE_DIR}/${params.resourceId}.bin`;
    try {
      await Filesystem.mkdir({ path: NATIVE_DIR, directory: Directory.Data, recursive: true });
    } catch {
      /* already exists */
    }
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: await blobToBase64(params.blob),
    });
    localPath = path;
  } else {
    await idbSet(BLOB_STORE, params.resourceId, params.blob);
  }

  const entry: CachedFileEntry = {
    resourceId: params.resourceId,
    lessonId: params.lessonId ?? previous?.lessonId ?? null,
    subjectId: params.subjectId ?? previous?.subjectId ?? null,
    localPath,
    downloadedVersion: params.version,
    downloadedAt: Date.now(),
    fileSize: params.blob.size,
    contentType,
    contentSha256: params.contentSha256 ?? null,
    lastOpenedPage: previous?.lastOpenedPage ?? 1,
    lastOpenedAt: previous?.lastOpenedAt ?? Date.now(),
    pinnedOffline: params.pinnedOffline ?? previous?.pinnedOffline ?? false,
  };
  await idbSet(META_STORE, params.resourceId, entry);
  return entry;
}

export async function readFile(resourceId: string): Promise<Blob | null> {
  const entry = await getEntry(resourceId);
  if (!entry) return null;

  if (isNative() && entry.localPath) {
    try {
      const { Filesystem, Directory } = await nativeFs();
      const res = await Filesystem.readFile({ path: entry.localPath, directory: Directory.Data });
      const data = typeof res.data === "string" ? res.data : "";
      if (!data) return null;
      const blob = base64ToBlob(data, entry.contentType);
      if (!(await matchesPersistedHash(blob, entry.contentSha256))) {
        await removeFile(resourceId);
        return null;
      }
      return blob;
    } catch {
      return null;
    }
  }

  try {
    const blob = (await idbGet<Blob>(BLOB_STORE, resourceId)) ?? null;
    if (blob && !(await matchesPersistedHash(blob, entry.contentSha256))) {
      await removeFile(resourceId);
      return null;
    }
    return blob;
  } catch {
    return null;
  }
}

async function matchesPersistedHash(blob: Blob, expected: string | null | undefined) {
  if (!expected) return true;
  try {
    return (await sha256Hex(new Uint8Array(await blob.arrayBuffer()))) === expected;
  } catch {
    return false;
  }
}

export async function removeFile(resourceId: string): Promise<void> {
  const entry = await getEntry(resourceId);
  if (entry?.localPath && isNative()) {
    try {
      const { Filesystem, Directory } = await nativeFs();
      await Filesystem.deleteFile({ path: entry.localPath, directory: Directory.Data });
    } catch {
      /* already gone */
    }
  }
  try {
    await idbDelete(BLOB_STORE, resourceId);
  } catch {
    /* ignore */
  }
  try {
    await idbDelete(META_STORE, resourceId);
  } catch {
    /* ignore */
  }
}

export async function clearAll(): Promise<void> {
  const entries = await listEntries();
  await Promise.all(entries.map((e) => removeFile(e.resourceId)));
}

export async function touchEntry(
  resourceId: string,
  patch: Partial<Pick<CachedFileEntry, "lastOpenedPage" | "pinnedOffline">>,
): Promise<void> {
  const entry = await getEntry(resourceId);
  if (!entry) return;
  await idbSet(META_STORE, resourceId, { ...entry, ...patch, lastOpenedAt: Date.now() });
}

/**
 * LRU eviction. Pinned files (explicit "download for offline" choices) are
 * never removed automatically.
 */
export async function enforceCacheLimit(
  limitBytes: number = DEFAULT_CACHE_LIMIT_BYTES,
): Promise<number> {
  const entries = await listEntries();
  let total = entries.reduce((sum, e) => sum + (e.fileSize || 0), 0);
  if (total <= limitBytes) return 0;

  const evictable = entries
    .filter((e) => !e.pinnedOffline)
    .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt);

  let removed = 0;
  for (const entry of evictable) {
    if (total <= limitBytes) break;
    await removeFile(entry.resourceId);
    total -= entry.fileSize || 0;
    removed += 1;
  }
  return removed;
}

export function isNativeStorage(): boolean {
  return isNative();
}
