/**
 * 21B4-B — Local Textbook Registry.
 *
 * A tiny, app-private JSON index of the textbooks whose bytes are already on
 * the device. Its only consumer besides the app itself is the in-APK offline
 * entry screen (`mobile/www/index.html`), which must be able to list saved
 * books and open them natively while the remote origin is unreachable.
 *
 * Hard rules:
 *   - Native (Capacitor) only. On the web this module is a no-op.
 *   - Metadata ONLY. Never an access/refresh token, password, signed URL,
 *     storage key, bucket name or any secret. `sanitizeRecord` is the single
 *     writer and drops every field that is not on the allow-list.
 *   - `localPath` is always a path RELATIVE to the app-private data directory,
 *     which is the only thing `TamkeenPdfViewer.open` accepts.
 */

import { Capacitor } from "@capacitor/core";

export const REGISTRY_DIR = "tamkeen/registry";
export const REGISTRY_PATH = `${REGISTRY_DIR}/textbooks.json`;
export const REGISTRY_VERSION = 1;

export type LocalTextbookRecord = {
  textbookId: string;
  title: string;
  subjectId: string | null;
  subjectLabel: string | null;
  bookType: "MAIN_TEXTBOOK" | "EXERCISE_BOOK" | "OTHER";
  coverageLabel: string | null;
  /** Path relative to the app-private data directory (Directory.Data). */
  localPath: string;
  version: string;
  sha256: string | null;
  fileSize: number | null;
  downloadedAt: number;
  offlineReady: boolean;
};

export type LocalTextbookRegistry = {
  registryVersion: number;
  updatedAt: number;
  books: LocalTextbookRecord[];
};

/** Fields the registry is ever allowed to persist. */
export const REGISTRY_ALLOWED_FIELDS: readonly (keyof LocalTextbookRecord)[] = [
  "textbookId",
  "title",
  "subjectId",
  "subjectLabel",
  "bookType",
  "coverageLabel",
  "localPath",
  "version",
  "sha256",
  "fileSize",
  "downloadedAt",
  "offlineReady",
];

export function isNativeRegistry(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Same guard the native plugin enforces: app-private relative paths only. */
export function isPrivateRelativePath(path: string | null | undefined): boolean {
  const value = (path ?? "").trim();
  if (!value) return false;
  if (value.startsWith("/")) return false;
  if (value.includes("..")) return false;
  if (/^[a-z]+:\/\//i.test(value)) return false;
  return true;
}

/** Drops unknown keys and rejects anything that is not a safe private path. */
export function sanitizeRecord(input: Partial<LocalTextbookRecord>): LocalTextbookRecord | null {
  const textbookId = String(input.textbookId ?? "").trim();
  const localPath = String(input.localPath ?? "").trim();
  if (!textbookId || !isPrivateRelativePath(localPath)) return null;

  const bookType =
    input.bookType === "EXERCISE_BOOK" || input.bookType === "OTHER"
      ? input.bookType
      : "MAIN_TEXTBOOK";

  return {
    textbookId,
    title: String(input.title ?? "كتاب المنهج").slice(0, 200),
    subjectId: input.subjectId ? String(input.subjectId) : null,
    subjectLabel: input.subjectLabel ? String(input.subjectLabel).slice(0, 120) : null,
    bookType,
    coverageLabel: input.coverageLabel ? String(input.coverageLabel).slice(0, 80) : null,
    localPath,
    version: String(input.version ?? "0").slice(0, 80),
    sha256: input.sha256 ? String(input.sha256).slice(0, 64) : null,
    fileSize: typeof input.fileSize === "number" ? input.fileSize : null,
    downloadedAt: typeof input.downloadedAt === "number" ? input.downloadedAt : Date.now(),
    offlineReady: input.offlineReady === true,
  };
}

async function nativeFs() {
  const mod = await import("@capacitor/filesystem");
  return { Filesystem: mod.Filesystem, Directory: mod.Directory, Encoding: mod.Encoding };
}

function emptyRegistry(): LocalTextbookRegistry {
  return { registryVersion: REGISTRY_VERSION, updatedAt: Date.now(), books: [] };
}

export function parseRegistry(raw: string): LocalTextbookRegistry {
  try {
    const parsed = JSON.parse(raw) as Partial<LocalTextbookRegistry>;
    const books = Array.isArray(parsed.books) ? parsed.books : [];
    return {
      registryVersion: REGISTRY_VERSION,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      books: books
        .map((b) => sanitizeRecord(b as Partial<LocalTextbookRecord>))
        .filter((b): b is LocalTextbookRecord => b !== null),
    };
  } catch {
    return emptyRegistry();
  }
}

export async function readLocalRegistry(): Promise<LocalTextbookRegistry> {
  if (!isNativeRegistry()) return emptyRegistry();
  try {
    const { Filesystem, Directory, Encoding } = await nativeFs();
    const res = await Filesystem.readFile({
      path: REGISTRY_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return parseRegistry(typeof res.data === "string" ? res.data : "");
  } catch {
    return emptyRegistry();
  }
}

async function writeRegistry(registry: LocalTextbookRegistry): Promise<void> {
  const { Filesystem, Directory, Encoding } = await nativeFs();
  try {
    await Filesystem.mkdir({ path: REGISTRY_DIR, directory: Directory.Data, recursive: true });
  } catch {
    /* already exists */
  }
  await Filesystem.writeFile({
    path: REGISTRY_PATH,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify({ ...registry, registryVersion: REGISTRY_VERSION, updatedAt: Date.now() }),
  });
}

/** Adds or replaces one book. Best-effort: never throws into the UI. */
export async function registerLocalTextbook(
  input: Partial<LocalTextbookRecord>,
): Promise<LocalTextbookRecord | null> {
  const record = sanitizeRecord(input);
  if (!record || !isNativeRegistry()) return null;
  try {
    const registry = await readLocalRegistry();
    const books = registry.books.filter((b) => b.textbookId !== record.textbookId);
    books.push(record);
    await writeRegistry({ ...registry, books });
    return record;
  } catch {
    return null;
  }
}

export async function unregisterLocalTextbook(textbookId: string): Promise<void> {
  if (!isNativeRegistry()) return;
  try {
    const registry = await readLocalRegistry();
    await writeRegistry({
      ...registry,
      books: registry.books.filter((b) => b.textbookId !== textbookId),
    });
  } catch {
    /* best effort */
  }
}

export async function markLocalTextbookOfflineReady(
  textbookId: string,
  offlineReady: boolean,
): Promise<void> {
  if (!isNativeRegistry()) return;
  try {
    const registry = await readLocalRegistry();
    const books = registry.books.map((b) =>
      b.textbookId === textbookId ? { ...b, offlineReady } : b,
    );
    await writeRegistry({ ...registry, books });
  } catch {
    /* best effort */
  }
}

/** Best-effort content hash; skipped for very large files. */
export async function computeSha256(blob: Blob, maxBytes = 80 * 1024 * 1024): Promise<string | null> {
  try {
    if (blob.size > maxBytes) return null;
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
