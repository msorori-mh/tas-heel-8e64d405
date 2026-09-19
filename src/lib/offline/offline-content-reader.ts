/** Bounded, RLS-preserving reads. Never return a successful partial content list. */
export type ContentReadError = { code?: string; message?: string };
export function isMissingOfflineField(error: ContentReadError | null, field: string): boolean {
  return (
    ["42703", "PGRST204"].includes(error?.code ?? "") && error?.message?.includes(field) === true
  );
}
export class OfflineContentReadError extends Error {
  constructor(source: string, error: ContentReadError) {
    const code = /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? error.code : "UNKNOWN";
    super(`content_${source}_${code}_lookup_failed`);
  }
}

export async function readOfflineContent<T>(
  source: string,
  lessonIds: string[],
  read: (
    ids: string[],
    from: number,
    to: number,
    legacy: boolean,
  ) => PromiseLike<{
    data: T[] | null;
    error: ContentReadError | null;
  }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  let legacy = false;
  for (let offset = 0; offset < lessonIds.length; offset += 8) {
    const ids = lessonIds.slice(offset, offset + 8);
    for (let from = 0; ; ) {
      signal?.throwIfAborted();
      let pageSize = legacy ? 8 : 64;
      let result = await read(ids, from, from + pageSize - 1, legacy);
      signal?.throwIfAborted();
      // Only a specifically missing metadata column permits the legacy path.
      // Auth, policy, timeout and all other failures remain visible.
      if (!legacy && isMissingOfflineField(result.error, "offline_metadata_v1")) {
        legacy = true;
        pageSize = 8;
        result = await read(ids, from, from + pageSize - 1, true);
      }
      signal?.throwIfAborted();
      if (result.error) throw new OfflineContentReadError(source, result.error);
      if (!result.data) throw new OfflineContentReadError(source, { code: "NODATA" });
      rows.push(...result.data);
      if (result.data.length < pageSize) break;
      from += pageSize;
    }
  }
  return rows;
}

/** The optional batch RPC and metadata columns were introduced in the same migration. */
export async function readOfflineLessonGates<T extends { lesson_id: string }>(
  lessonIds: string[],
  batch: (ids: string[]) => PromiseLike<{ data: T[] | null; error: ContentReadError | null }>,
  single: (id: string) => PromiseLike<{ data: T[] | null; error: ContentReadError | null }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  let legacy = false;
  for (let offset = 0; offset < lessonIds.length; offset += 200) {
    const ids = lessonIds.slice(offset, offset + 200);
    signal?.throwIfAborted();
    if (!legacy) {
      const result = await batch(ids);
      signal?.throwIfAborted();
      legacy =
        ["42883", "PGRST202"].includes(result.error?.code ?? "") &&
        result.error?.message?.includes("lesson_student_content_gates") === true;
      if (!legacy) {
        if (result.error) throw new OfflineContentReadError("gates", result.error);
        if (!result.data) throw new OfflineContentReadError("gates", { code: "NODATA" });
        rows.push(...result.data);
        continue;
      }
    }
    // Use the same caller's legacy RPC for IDs already read through lesson RLS.
    for (const id of ids) {
      signal?.throwIfAborted();
      const result = await single(id);
      signal?.throwIfAborted();
      if (result.error) throw new OfflineContentReadError("gates", result.error);
      if (!result.data) throw new OfflineContentReadError("gates", { code: "NODATA" });
      rows.push(...result.data.filter((row) => row.lesson_id === id));
    }
  }
  return rows;
}
