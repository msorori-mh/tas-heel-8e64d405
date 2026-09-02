/** OFFLINE-02 — account-isolated private storage for non-PDF pack artifacts. */

import { Capacitor } from "@capacitor/core";

import {
  offlinePackArtifactSchema,
  verifyOfflineArtifact,
  type OfflinePackArtifact,
} from "./offline-pack-contract";

type CachedArtifact = {
  ownerId: string;
  artifactId: string;
  relativePath: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

const DB_NAME = "tamkeen-offline-artifacts";
const DB_VERSION = 1;
const BYTE_STORE = "artifact-bytes";
const META_STORE = "artifact-meta";
const NATIVE_ROOT = "tamkeen/offline-artifacts";
let databasePromise: Promise<IDBDatabase> | null = null;

function key(ownerId: string, artifactId: string): string {
  return `${ownerId}\u0000${artifactId}`;
}

function ownerSegment(ownerId: string): string {
  const safe = ownerId.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (!safe) throw new Error("OFFLINE_OWNER_ID_INVALID");
  return safe;
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("OFFLINE_IDB_MISSING"));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(BYTE_STORE)) {
          request.result.createObjectStore(BYTE_STORE);
        }
        if (!request.result.objectStoreNames.contains(META_STORE)) {
          request.result.createObjectStore(META_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("OFFLINE_IDB_OPEN_FAILED"));
    });
  }
  return databasePromise;
}

async function idbGet<T>(store: string, itemKey: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(store, "readonly").objectStore(store).get(itemKey);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("OFFLINE_IDB_READ_FAILED"));
  });
}

async function idbPut(store: string, itemKey: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).put(value, itemKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("OFFLINE_IDB_WRITE_FAILED"));
  });
}

async function idbDelete(store: string, itemKey: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).delete(itemKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("OFFLINE_IDB_DELETE_FAILED"));
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function nativeFilesystem() {
  const module = await import("@capacitor/filesystem");
  return { Filesystem: module.Filesystem, Directory: module.Directory };
}

function nativePath(ownerId: string, artifact: OfflinePackArtifact): string {
  return `${NATIVE_ROOT}/${ownerSegment(ownerId)}/${artifact.relativePath}`;
}

export async function saveOfflineArtifactBytes(
  ownerId: string,
  artifactInput: OfflinePackArtifact,
  bytes: Uint8Array,
): Promise<void> {
  const artifact = offlinePackArtifactSchema.parse(artifactInput);
  await verifyOfflineArtifact(bytes, artifact);
  const metadata: CachedArtifact = {
    ownerId,
    artifactId: artifact.artifactId,
    relativePath: artifact.relativePath,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
  };

  if (isNative()) {
    const { Filesystem, Directory } = await nativeFilesystem();
    const path = nativePath(ownerId, artifact);
    const directory = path.slice(0, path.lastIndexOf("/"));
    try {
      await Filesystem.mkdir({ path: directory, directory: Directory.Data, recursive: true });
    } catch {
      // Directory already exists.
    }
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: bytesToBase64(bytes),
    });
    await idbPut(META_STORE, key(ownerId, artifact.artifactId), metadata);
    return;
  }

  await idbPut(BYTE_STORE, key(ownerId, artifact.artifactId), Uint8Array.from(bytes));
  await idbPut(META_STORE, key(ownerId, artifact.artifactId), metadata);
}

export async function removeOfflineArtifact(
  ownerId: string,
  artifact: OfflinePackArtifact,
): Promise<void> {
  const itemKey = key(ownerId, artifact.artifactId);
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await nativeFilesystem();
      await Filesystem.deleteFile({
        path: nativePath(ownerId, artifact),
        directory: Directory.Data,
      });
    } catch {
      // Already absent.
    }
  }
  await Promise.allSettled([idbDelete(BYTE_STORE, itemKey), idbDelete(META_STORE, itemKey)]);
}

export async function readOfflineArtifactBytes(
  ownerId: string,
  artifactInput: OfflinePackArtifact,
): Promise<Uint8Array | null> {
  const artifact = offlinePackArtifactSchema.parse(artifactInput);
  const itemKey = key(ownerId, artifact.artifactId);
  try {
    const metadata = await idbGet<CachedArtifact>(META_STORE, itemKey);
    if (
      !metadata ||
      metadata.ownerId !== ownerId ||
      metadata.sha256 !== artifact.sha256 ||
      metadata.byteSize !== artifact.byteSize ||
      metadata.relativePath !== artifact.relativePath
    ) {
      await removeOfflineArtifact(ownerId, artifact);
      return null;
    }

    let bytes: Uint8Array | null;
    if (isNative()) {
      const { Filesystem, Directory } = await nativeFilesystem();
      const result = await Filesystem.readFile({
        path: nativePath(ownerId, artifact),
        directory: Directory.Data,
      });
      bytes = typeof result.data === "string" ? base64ToBytes(result.data) : null;
    } else {
      const value = await idbGet<Uint8Array | ArrayBuffer>(BYTE_STORE, itemKey);
      bytes = value ? (value instanceof Uint8Array ? value : new Uint8Array(value)) : null;
    }
    if (!bytes) return null;
    await verifyOfflineArtifact(bytes, artifact);
    return bytes;
  } catch {
    await removeOfflineArtifact(ownerId, artifact);
    return null;
  }
}
