/**
 * 21B — student side of subject textbooks.
 *
 * Reads metadata through RLS (fail-closed), then reuses the 18C secure
 * delivery + offline cache verbatim. No new storage flow, no auto-download.
 */

import { supabase } from "@/integrations/supabase/client";
import { downloadAndCache, fetchFileMeta } from "@/lib/offline/lesson-file-client";
import { getEntry, removeFile } from "@/lib/offline/pdf-cache";

export type StudentTextbook = {
  id: string;
  subjectId: string;
  semester: number | null;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  version: string;
  sortOrder: number;
};

export type TextbookLocalState = {
  cached: boolean;
  cachedVersion: string | null;
  updateAvailable: boolean;
  bytes: number | null;
};

export async function listStudentTextbooks(params: {
  subjectId: string;
  semester?: number | null;
}): Promise<StudentTextbook[]> {
  const query = (supabase as never as { from: (t: string) => any })
    .from("subject_textbooks")
    .select("id, subject_id, semester, title, file_name, file_size, version, sort_order")
    .eq("subject_id", params.subjectId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows
    .filter(
      (r) =>
        params.semester == null ||
        r["semester"] == null ||
        Number(r["semester"]) === Number(params.semester),
    )
    .map((r) => ({
      id: String(r["id"]),
      subjectId: String(r["subject_id"]),
      semester: (r["semester"] as number | null) ?? null,
      title: String(r["title"] ?? "كتاب المنهج"),
      fileName: (r["file_name"] as string | null) ?? null,
      fileSize: (r["file_size"] as number | null) ?? null,
      version: String(r["version"] ?? "0"),
      sortOrder: Number(r["sort_order"] ?? 0),
    }));
}

/** Local (device) state for one textbook — offline-safe, never throws. */
export async function readTextbookLocalState(
  textbook: StudentTextbook,
): Promise<TextbookLocalState> {
  const entry = await getEntry(textbook.id);
  if (!entry) {
    return { cached: false, cachedVersion: null, updateAvailable: false, bytes: null };
  }
  let updateAvailable = entry.downloadedVersion !== textbook.version;
  if (!updateAvailable) {
    try {
      const meta = await fetchFileMeta(textbook.id, "textbook");
      updateAvailable = meta.version !== entry.downloadedVersion;
    } catch {
      updateAvailable = false;
    }
  }
  return {
    cached: true,
    cachedVersion: entry.downloadedVersion,
    updateAvailable,
    bytes: entry.fileSize ?? null,
  };
}

/** Explicit, student-initiated download (resumable-safe: retry re-downloads). */
export async function downloadTextbook(params: {
  textbook: StudentTextbook;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
}) {
  return downloadAndCache({
    resourceId: params.textbook.id,
    lessonId: null,
    subjectId: params.textbook.subjectId,
    kind: "textbook",
    pinnedOffline: true,
    signal: params.signal,
    onProgress: params.onProgress,
  });
}

export async function deleteLocalTextbook(textbookId: string): Promise<void> {
  await removeFile(textbookId);
}
