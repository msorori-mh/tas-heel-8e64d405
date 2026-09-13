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
import { sha256Hex } from "./offline-pack-contract";
import { withForegroundTransfer } from "./download-priority";

export type FileMeta = {
  version: string;
  size: number | null;
  contentType: string;
  sha256: string | null;
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

function responseSha256(response: Response): string | null {
  const value = response.headers.get("x-file-sha256")?.trim().toLowerCase() ?? "";
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

async function authHeaders(signal?: AbortSignal): Promise<Record<string, string>> {
  signal?.throwIfAborted();
  const session = supabase.auth.getSession();
  const { data } = signal
    ? await new Promise<Awaited<typeof session>>((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
        session.then(
          (value) => {
            signal.removeEventListener("abort", abort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener("abort", abort);
            reject(error);
          },
        );
      })
    : await session;
  const token = data.session?.access_token;
  if (!token) throw new Error("unauthenticated");
  return { Authorization: `Bearer ${token}` };
}

/** HEAD — used to show estimated size and to detect a newer server version. */
export async function fetchFileMeta(
  resourceId: string,
  kind: SecureFileKind = "lesson",
  signal?: AbortSignal,
): Promise<FileMeta> {
  const headers = await authHeaders(signal);
  signal?.throwIfAborted();
  const res = await fetch(endpoint(resourceId, kind), {
    method: "HEAD",
    headers,
    signal,
  });
  if (!res.ok) throw new Error(`file_meta_failed_${res.status}`);
  const length = res.headers.get("content-length");
  return {
    version: res.headers.get("x-file-version") ?? "0",
    size: length ? Number(length) : null,
    contentType: res.headers.get("content-type") ?? "application/pdf",
    sha256: responseSha256(res),
  };
}

type DownloadFileParams = {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  pinnedOffline?: boolean;
  kind?: SecureFileKind;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
  priority?: "foreground" | "background";
};

export function downloadAndCache(
  params: DownloadFileParams,
): Promise<{ blob: Blob; version: string; sha256: string }> {
  return params.priority === "background"
    ? fetchAndCache(params)
    : withForegroundTransfer(() => fetchAndCache(params));
}

async function fetchAndCache(
  params: DownloadFileParams,
): Promise<{ blob: Blob; version: string; sha256: string }> {
  params.signal?.throwIfAborted();
  const headers = await authHeaders(params.signal);
  params.signal?.throwIfAborted();
  const res = await fetch(endpoint(params.resourceId, params.kind ?? "lesson"), {
    method: "GET",
    headers,
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
      params.signal?.throwIfAborted();
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

  params.signal?.throwIfAborted();
  const observedSha256 = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
  const expectedSha256 = responseSha256(res);
  if (expectedSha256 && observedSha256 !== expectedSha256) {
    throw new Error("file_download_hash_mismatch");
  }

  params.signal?.throwIfAborted();
  await saveFile({
    resourceId: params.resourceId,
    lessonId: params.lessonId ?? null,
    subjectId: params.subjectId ?? null,
    blob,
    version,
    contentType,
    contentSha256: observedSha256,
    pinnedOffline: params.pinnedOffline,
  });
  await enforceCacheLimit(DEFAULT_CACHE_LIMIT_BYTES);

  return { blob, version, sha256: observedSha256 };
}

/**
 * Read verified, entitled local bytes without waiting for any network request.
 * The reader checks for updates separately and replaces bytes only on request.
 */
export async function resolveLessonFile(params: {
  resourceId: string;
  lessonId?: string | null;
  subjectId?: string | null;
  kind?: SecureFileKind;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
}): Promise<ResolvedFile> {
  params.signal?.throwIfAborted();
  const cached = await getEntry(params.resourceId);
  const entitlement = cached
    ? await canOpenCachedResource(params.resourceId)
    : { allowed: false as const };

  if (cached && entitlement.allowed) {
    const localBlob = await readFile(params.resourceId);
    if (localBlob) {
      params.signal?.throwIfAborted();
      void touchEntry(params.resourceId, {}).catch(() => undefined);
      return {
        blob: localBlob,
        version: cached.downloadedVersion,
        fromCache: true,
        stale: false,
        lastOpenedPage: cached.lastOpenedPage || 1,
      };
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
