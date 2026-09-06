/**
 * MINISTERIAL_QUESTION_MEDIA_V1 — browser side of image delivery.
 *
 * Students and staff only ever know a `media_id`; bytes come through the
 * authenticated `/api/ministerial-media/{id}` route and are kept as short-lived
 * object URLs in memory (never in localStorage, never as public links).
 */

import { supabase } from "@/integrations/supabase/client";

const MAX_CACHED = 64;

type CacheEntry =
  | { objectUrl: string; refs: number; promise?: never }
  | { promise: Promise<string>; refs: number; objectUrl?: never };

const cache = new Map<string, CacheEntry>();
const order: string[] = [];

function cacheKey(mediaId: string, sessionId: string | null): string {
  return `${mediaId}::${sessionId ?? "staff"}`;
}

export function ministerialMediaEndpoint(mediaId: string, sessionId: string | null): string {
  const base = `/api/ministerial-media/${encodeURIComponent(mediaId)}`;
  return sessionId ? `${base}?session=${encodeURIComponent(sessionId)}` : base;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("unauthenticated");
  return { Authorization: `Bearer ${token}` };
}

export class MinisterialMediaError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`ministerial_media_${code}`);
    this.name = "MinisterialMediaError";
  }
}

async function download(mediaId: string, sessionId: string | null): Promise<string> {
  const response = await fetch(ministerialMediaEndpoint(mediaId, sessionId), {
    method: "GET",
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new MinisterialMediaError(response.status, code);
  }
  const type = response.headers.get("content-type") ?? "application/octet-stream";
  if (!type.startsWith("image/")) throw new MinisterialMediaError(415, "not_an_image");
  const blob = await response.blob();
  return URL.createObjectURL(blob.type ? blob : new Blob([blob], { type }));
}

function evictIfNeeded() {
  while (order.length > MAX_CACHED) {
    const victim = order.find((key) => (cache.get(key)?.refs ?? 0) <= 0);
    if (!victim) return;
    const entry = cache.get(victim);
    if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    cache.delete(victim);
    order.splice(order.indexOf(victim), 1);
  }
}

/**
 * Acquire an object URL for an image. Callers MUST call the returned
 * `release()` when unmounting so the blob can be revoked.
 */
export async function acquireMinisterialMediaUrl(
  mediaId: string,
  sessionId: string | null,
): Promise<{ url: string; release: () => void }> {
  const key = cacheKey(mediaId, sessionId);
  let entry = cache.get(key);
  if (!entry) {
    const promise = download(mediaId, sessionId);
    entry = { promise, refs: 0 };
    cache.set(key, entry);
    order.push(key);
    try {
      const objectUrl = await promise;
      cache.set(key, { objectUrl, refs: entry.refs });
    } catch (error) {
      cache.delete(key);
      order.splice(order.indexOf(key), 1);
      throw error;
    }
  }
  const settled = cache.get(key)!;
  settled.refs += 1;
  const url = settled.objectUrl ?? (await settled.promise!);
  let released = false;
  return {
    url,
    release: () => {
      if (released) return;
      released = true;
      const current = cache.get(key);
      if (current) current.refs = Math.max(0, current.refs - 1);
      evictIfNeeded();
    },
  };
}

/** Drop every cached image (e.g. after staff replaces media). */
export function clearMinisterialMediaCache(): void {
  for (const entry of cache.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  cache.clear();
  order.length = 0;
}

export function describeMinisterialMediaError(error: unknown): string {
  if (error instanceof MinisterialMediaError) {
    if (error.status === 401) return "انتهت الجلسة، سجّل الدخول مرة أخرى لعرض الصورة.";
    if (error.status === 404) return "الصورة غير متاحة لهذه المحاولة.";
    if (error.status === 502) return "تعذر جلب الصورة من الخادم. حاول مرة أخرى.";
  }
  if (error instanceof Error && error.message === "unauthenticated") {
    return "سجّل الدخول لعرض الصورة.";
  }
  return "تعذر تحميل الصورة.";
}
