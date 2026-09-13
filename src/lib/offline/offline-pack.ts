/**
 * 18C-4 — offline packs (subject pack / grade pack) and Wi-Fi prefetch.
 *
 * A "pack" is simply the set of primary lesson files for a list of lessons.
 * Nothing is ever downloaded platform-wide: packs are always an explicit,
 * scoped student choice, except the small Wi-Fi prefetch of the next lessons.
 */

import { dataSaverSnapshot, getDataSaverEnabled, subscribeDataSaver } from "./data-saver";
import {
  beginBackgroundTransfer,
  hasForegroundTransfers,
  subscribeDownloadPriority,
} from "./download-priority";
import { supabase } from "@/integrations/supabase/client";
import { downloadAndCache, fetchFileMeta } from "./lesson-file-client";
import { getEntry, touchEntry } from "./pdf-cache";
import { getFreeStorageBytes, getNetworkState } from "./network";

export type PackResource = {
  resourceId: string;
  lessonId: string;
  title: string | null;
};

export type PackStatus = {
  resources: PackResource[];
  cachedIds: Set<string>;
  missingIds: string[];
};

const PDF_LIKE = new Set(["pdf", "link"]);

/**
 * Downloadable lesson files for the given lessons (PDF-like resources only).
 *
 * `is_primary` is only a preference: when a lesson flags a primary file we take
 * it, otherwise every PDF-like resource of that lesson is part of the pack.
 */
export async function listPackResources(
  lessonIds: string[],
  signal?: AbortSignal,
): Promise<PackResource[]> {
  if (lessonIds.length === 0) return [];
  const out: PackResource[] = [];
  const chunkSize = 100;
  for (let i = 0; i < lessonIds.length; i += chunkSize) {
    const chunk = lessonIds.slice(i, i + chunkSize);
    signal?.throwIfAborted();
    const query = (supabase.from("lesson_resources") as any)
      .select("id,lesson_id,title,resource_type,url,is_primary")
      .in("lesson_id", chunk);
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    signal?.throwIfAborted();
    if (error) throw error;

    const byLesson = new Map<string, PackResource[]>();
    const primaryByLesson = new Map<string, PackResource[]>();

    for (const row of (data ?? []) as Array<{
      id: string;
      lesson_id: string;
      title: string | null;
      resource_type: string | null;
      url: string;
      is_primary?: boolean | null;
    }>) {
      const looksPdf =
        PDF_LIKE.has(row.resource_type ?? "") ||
        /\.pdf(?:$|[?#])/i.test(row.url) ||
        /drive\.google\.com|docs\.google\.com/i.test(row.url);
      if (!looksPdf) continue;
      const item: PackResource = {
        resourceId: row.id,
        lessonId: row.lesson_id,
        title: row.title,
      };
      const bucket = row.is_primary ? primaryByLesson : byLesson;
      const list = bucket.get(row.lesson_id) ?? [];
      list.push(item);
      bucket.set(row.lesson_id, list);
    }

    for (const lessonId of chunk) {
      const preferred = primaryByLesson.get(lessonId) ?? byLesson.get(lessonId) ?? [];
      out.push(...preferred);
    }
  }
  return out;
}

export async function getPackStatus(lessonIds: string[]): Promise<PackStatus> {
  const resources = await listPackResources(lessonIds);
  const cachedIds = new Set<string>();
  for (const r of resources) {
    const entry = await getEntry(r.resourceId);
    if (entry) cachedIds.add(r.resourceId);
  }
  return {
    resources,
    cachedIds,
    missingIds: resources.filter((r) => !cachedIds.has(r.resourceId)).map((r) => r.resourceId),
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Estimated download size for the not-yet-cached files (HEAD requests). */
export async function estimatePackSize(resourceIds: string[]): Promise<{
  bytes: number;
  unknown: number;
}> {
  let bytes = 0;
  let unknown = 0;
  await mapLimit(resourceIds, 4, async (id) => {
    try {
      const meta = await fetchFileMeta(id);
      if (meta.size) bytes += meta.size;
      else unknown += 1;
    } catch {
      unknown += 1;
    }
  });
  return { bytes, unknown };
}

export type PackProgress = {
  total: number;
  done: number;
  failed: string[];
  currentTitle: string | null;
};

/** Downloads a pack sequentially; every file is pinned (never LRU-evicted). */
export async function downloadPack(params: {
  resources: PackResource[];
  subjectId?: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: PackProgress) => void;
}): Promise<PackProgress> {
  const progress: PackProgress = {
    total: params.resources.length,
    done: 0,
    failed: [],
    currentTitle: null,
  };

  for (const resource of params.resources) {
    if (params.signal?.aborted) break;
    progress.currentTitle = resource.title;
    params.onProgress?.({ ...progress });
    try {
      const existing = await getEntry(resource.resourceId);
      if (existing) {
        await touchEntry(resource.resourceId, { pinnedOffline: true });
      } else {
        await downloadAndCache({
          resourceId: resource.resourceId,
          lessonId: resource.lessonId,
          subjectId: params.subjectId ?? null,
          pinnedOffline: true,
          signal: params.signal,
        });
      }
      progress.done += 1;
    } catch {
      progress.failed.push(resource.resourceId);
    }
    params.onProgress?.({ ...progress });
  }

  progress.currentTitle = null;
  params.onProgress?.({ ...progress });
  return progress;
}

/** Optional next-lesson files; never compete with an opened lesson. */
export async function prefetchNextLessons(params: {
  lessonIds: string[];
  subjectId?: string | null;
  maxLessons?: number;
  signal?: AbortSignal;
}): Promise<number> {
  if (await getDataSaverEnabled()) return 0;
  const lease = beginBackgroundTransfer(params.signal);
  if (!lease) return 0;
  let fetched = 0;
  try {
    const network = await getNetworkState();
    lease.signal.throwIfAborted();
    if (!network.online || !network.wifi || dataSaverSnapshot()) return 0;
    const free = await getFreeStorageBytes();
    lease.signal.throwIfAborted();
    if (free !== null && free < 200 * 1024 * 1024) return 0;
    const scope = params.lessonIds.slice(0, params.maxLessons ?? 2);
    const resources = await listPackResources(scope, lease.signal);
    for (const resource of resources) {
      lease.signal.throwIfAborted();
      if (dataSaverSnapshot()) break;
      if (await getEntry(resource.resourceId)) continue;
      lease.signal.throwIfAborted();
      try {
        await downloadAndCache({
          resourceId: resource.resourceId,
          lessonId: resource.lessonId,
          subjectId: params.subjectId ?? null,
          priority: "background",
          signal: lease.signal,
        });
        fetched += 1;
      } catch {
        if (lease.signal.aborted) break;
        // Other missing files may still be available.
      }
    }
  } catch {
    // Optional work must not interrupt reading.
  } finally {
    lease.release();
  }
  return fetched;
}

/** One scoped prefetch per visit, after three seconds without foreground work. */
export function scheduleLessonPrefetch(params: {
  lessonIds: string[];
  subjectId?: string | null;
}): () => void {
  let disposed = false;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | null = null;
  const allowed = () => !disposed && !finished && !dataSaverSnapshot() && !hasForegroundTransfers();
  const schedule = () => {
    clearTimeout(timer);
    if (!allowed()) {
      active?.abort();
      return;
    }
    if (active || params.lessonIds.length === 0) return;
    timer = setTimeout(() => {
      if (!allowed()) return;
      const controller = new AbortController();
      active = controller;
      void prefetchNextLessons({ ...params, signal: controller.signal }).finally(() => {
        active = null;
        if (!controller.signal.aborted) finished = true;
        else if (allowed()) schedule();
      });
    }, 3000);
  };
  const offPreference = subscribeDataSaver(schedule);
  const offPriority = subscribeDownloadPriority(schedule);
  void getDataSaverEnabled().then(schedule);
  return () => {
    disposed = true;
    clearTimeout(timer);
    active?.abort();
    offPreference();
    offPriority();
  };
}
