/**
 * 18C — client side of the authenticated lesson-file delivery route.
 *
 * The student app only ever knows a resource id; the real Drive / storage URL
 * stays on the server.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_CACHE_LIMIT_BYTES,
  enforceCacheLimit,
  getEntry,
  readFile,
  saveFile,
  touchEntry,
} from "./pdf-cache";
import { canOpenCachedResource } from "./entitlement";

export type FileMeta = {
  version: string;
  size: number | null;
  contentType: string;
};

export type ResolvedFile = {
  blob: Blob;
  version: string;
  fromCache: boolean;
  stale: boolean;
  lastOpenedPage: number;
};

/** 21B — the same 18C pipeline serves lesson files and subject textbooks. */
export type SecureFileKind = "lesson" | "textbook";

function endpoint(resourceId: string, kind: SecureFileKind = "lesson"): string {
  const base = kind === "textbook" ? "/api/subject-textbook" : "/api/lesson-file";
  return `${base}/${encodeURIComponent(resourceId)}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("unauthenticated");
  return { Authorization: `Bearer ${token}` };
}

/** HEAD — used to show estimated size and to detect a newer server version. */
export async function fetchFileMeta(
  resourceId: string,
  kind: SecureFileKind = "lesson",
): Promise<FileMeta> {
  const res = await fetch(endpoint(resourceId, kind), {
    method: "HEAD",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`file_meta_failed_${res.status}`);
  const length = res.headers.get("content-length");
  return {
    version: res.headers.get("x-file-version") ?? "0",
    size: length ? Number(length) : null,
    contentType: res.headers.get("content-type") ?? "application/pdf",
  };
}

export async function downloadAndCache(params: {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  pinnedOffline?: boolean;
  kind?: SecureFileKind;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
}): Promise<{ blob: Blob; version: string }> {
  const res = await fetch(endpoint(params.resourceId, params.kind ?? "lesson"), {
    method: "GET",
    headers: await authHeaders(),
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`file_download_failed_${res.status}`);

  const version = res.headers.get("x-file-version") ?? "0";
  const contentType = res.headers.get("content-type") ?? "application/pdf";
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;

  let blob: Blob;
  if (res.body && params.onProgress) {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as unknown as BlobPart);
        loaded += value.byteLength;
        params.onProgress(loaded, total);
      }
    }
    blob = new Blob(chunks, { type: contentType });
  } else {
    blob = await res.blob();
  }

  await saveFile({
    resourceId: params.resourceId,
    lessonId: params.lessonId ?? null,
    subjectId: params.subjectId ?? null,
    blob,
    version,
    contentType,
    pinnedOffline: params.pinnedOffline,
  });
  await enforceCacheLimit(DEFAULT_CACHE_LIMIT_BYTES);

  return { blob, version };
}

/**
 * Offline-first read: local copy wins, network only fills gaps or replaces a
 * stale version. Never throws when a usable local copy exists.
 */
export async function resolveLessonFile(params: {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  kind?: SecureFileKind;
  onProgress?: (loaded: number, total: number | null) => void;
}): Promise<ResolvedFile> {
  const cached = await getEntry(params.resourceId);
  const entitlement = cached
    ? await canOpenCachedResource(params.resourceId)
    : { allowed: false as const };

  if (cached && entitlement.allowed) {
    const localBlob = await readFile(params.resourceId);
    if (localBlob) {
      // Version check is best-effort: no network → keep reading offline.
      let stale = false;
      try {
        const meta = await fetchFileMeta(params.resourceId, params.kind ?? "lesson");
        stale = meta.version !== cached.downloadedVersion;
      } catch {
        stale = false;
      }

      if (!stale) {
        await touchEntry(params.resourceId, {});
        return {
          blob: localBlob,
          version: cached.downloadedVersion,
          fromCache: true,
          stale: false,
          lastOpenedPage: cached.lastOpenedPage || 1,
        };
      }

      try {
        const fresh = await downloadAndCache(params);
        return {
          blob: fresh.blob,
          version: fresh.version,
          fromCache: false,
          stale: false,
          lastOpenedPage: cached.lastOpenedPage || 1,
        };
      } catch {
        return {
          blob: localBlob,
          version: cached.downloadedVersion,
          fromCache: true,
          stale: true,
          lastOpenedPage: cached.lastOpenedPage || 1,
        };
      }
    }
  }

  const fresh = await downloadAndCache(params);
  return {
    blob: fresh.blob,
    version: fresh.version,
    fromCache: false,
    stale: false,
    lastOpenedPage: cached?.lastOpenedPage || 1,
  };
}

export async function rememberLastPage(resourceId: string, page: number): Promise<void> {
  await touchEntry(resourceId, { lastOpenedPage: Math.max(1, Math.floor(page)) });
}
