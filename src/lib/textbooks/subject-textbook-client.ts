/**
 * 21B/13L — student side of subject textbooks.
 *
 * Student discovery is intentionally separated from the administrative
 * read-all policy. The scoped RPC always applies the profile grade and exact
 * governorate curriculum track, even if the account also has a staff role.
 */

import { supabase } from "@/integrations/supabase/client";
import { downloadAndCache, fetchFileMeta } from "@/lib/offline/lesson-file-client";
import { isReaderReady } from "@/lib/pdf/reader-runtime";
import { getEntry, removeFile } from "@/lib/offline/pdf-cache";
import {
  computeSha256,
  isNativeRegistry,
  registerLocalTextbook,
  unregisterLocalTextbook,
} from "@/lib/offline/local-textbook-registry";

export type StudentBookType = "MAIN_TEXTBOOK" | "EXERCISE_BOOK" | "OTHER";

export type StudentTextbook = {
  id: string;
  subjectId: string;
  bookType: StudentBookType;
  coverageType: "FULL_ACADEMIC_YEAR" | "SEMESTER_SPECIFIC";
  semester: 1 | 2 | null;
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

const BOOK_TYPE_RANK: Record<StudentBookType, number> = {
  MAIN_TEXTBOOK: 0,
  EXERCISE_BOOK: 1,
  OTHER: 2,
};

export const BOOK_TYPE_LABEL: Record<StudentBookType, string> = {
  MAIN_TEXTBOOK: "الكتاب الأساسي",
  EXERCISE_BOOK: "كتاب التمارين",
  OTHER: "ملحق",
};

type StudentTextbookRpcRow = Record<string, unknown>;
type StudentTextbookRpcClient = {
  rpc: (
    name: "list_student_subject_textbooks",
    args: { _subject_id: string; _semester: 1 | 2 | null },
  ) => Promise<{ data: StudentTextbookRpcRow[] | null; error: unknown }>;
};

/**
 * 21B-A2/A3 discovery rule for a given semester:
 * FULL_ACADEMIC_YEAR books always show, SEMESTER_SPECIFIC books only in their
 * own semester. The server additionally enforces grade + profile track.
 */
export async function listStudentTextbooks(params: {
  subjectId: string;
  semester?: 1 | 2 | null;
}): Promise<StudentTextbook[]> {
  const { data, error } = await (supabase as unknown as StudentTextbookRpcClient).rpc(
    "list_student_subject_textbooks",
    {
      _subject_id: params.subjectId,
      _semester: params.semester === 1 || params.semester === 2 ? params.semester : null,
    },
  );
  if (error) throw error;

  return (data ?? [])
    .map((r) => ({
      id: String(r["id"]),
      subjectId: String(r["subject_id"]),
      bookType: (r["book_type"] === "EXERCISE_BOOK" || r["book_type"] === "OTHER"
        ? r["book_type"]
        : "MAIN_TEXTBOOK") as StudentBookType,
      coverageType:
        r["coverage_type"] === "SEMESTER_SPECIFIC" ? "SEMESTER_SPECIFIC" : "FULL_ACADEMIC_YEAR",
      semester: (r["semester"] as 1 | 2 | null) ?? null,
      title: String(r["title"] ?? "كتاب المنهج"),
      fileName: (r["file_name"] as string | null) ?? null,
      fileSize: (r["file_size"] as number | null) ?? null,
      version: String(r["version"] ?? "0"),
      sortOrder: Number(r["sort_order"] ?? 0),
    }) as StudentTextbook)
    .sort(
      (a, b) =>
        BOOK_TYPE_RANK[a.bookType] - BOOK_TYPE_RANK[b.bookType] || a.sortOrder - b.sortOrder,
    );
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
  subjectLabel?: string | null;
}) {
  const result = await downloadAndCache({
    resourceId: params.textbook.id,
    lessonId: null,
    subjectId: params.textbook.subjectId,
    kind: "textbook",
    pinnedOffline: true,
    signal: params.signal,
    onProgress: params.onProgress,
  });

  if (isNativeRegistry()) {
    try {
      const entry = await getEntry(params.textbook.id);
      if (entry?.localPath) {
        await registerLocalTextbook({
          textbookId: params.textbook.id,
          title: params.textbook.title,
          subjectId: params.textbook.subjectId,
          subjectLabel: params.subjectLabel ?? null,
          bookType: params.textbook.bookType,
          coverageLabel:
            params.textbook.coverageType === "SEMESTER_SPECIFIC"
              ? `الفصل ${params.textbook.semester === 2 ? "الثاني" : "الأول"}`
              : "الفصلان",
          localPath: entry.localPath,
          version: result.version ?? params.textbook.version,
          sha256: await computeSha256(result.blob),
          fileSize: entry.fileSize ?? params.textbook.fileSize ?? null,
          downloadedAt: entry.downloadedAt,
          offlineReady: isReaderReady(),
        });
      }
    } catch {
      /* the registry is an offline convenience, never a download blocker */
    }
  }

  return result;
}

export async function deleteLocalTextbook(textbookId: string): Promise<void> {
  await removeFile(textbookId);
  await unregisterLocalTextbook(textbookId);
}
