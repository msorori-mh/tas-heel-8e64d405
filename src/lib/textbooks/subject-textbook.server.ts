/**
 * 21B — subject textbooks (server-only logic).
 *
 * Reuses the 18D upload pipeline verbatim: signed upload URL into the existing
 * private `lesson-pdfs` bucket, server-owned path, version bump on replace.
 * The operator never supplies a bucket, path or URL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const TEXTBOOK_BUCKET = "lesson-pdfs";
export const TEXTBOOK_PATH_PREFIX = "subject-textbooks";
export const MAX_TEXTBOOK_BYTES = 200 * 1024 * 1024;
const UPLOAD_URL_TTL = 900;

type Caller = SupabaseClient<Database>;
/** `subject_textbooks` is created by the 21B migration; typed access lands after apply. */
type Loose = {
  from: (table: string) => any;
  storage: Caller["storage"];
};

export type TextbookCoverage = "FULL_ACADEMIC_YEAR" | "SEMESTER_SPECIFIC";
/** 21B-A3 — book kind, an independent dimension from coverage. */
export type TextbookBookType = "MAIN_TEXTBOOK" | "EXERCISE_BOOK" | "OTHER";

export const BOOK_TYPE_RANK: Record<TextbookBookType, number> = {
  MAIN_TEXTBOOK: 0,
  EXERCISE_BOOK: 1,
  OTHER: 2,
};

export type SubjectTextbook = {
  id: string;
  subjectId: string;
  curriculumTrackId: string | null;
  bookType: TextbookBookType;
  coverageType: TextbookCoverage;
  semester: 1 | 2 | null;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  version: string;
  sha256: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string | null;
};

const BASE_COLUMNS =
  "id, subject_id, curriculum_track_id, coverage_type, semester, title, file_name, file_size, version, sha256, sort_order, is_active, updated_at";
const SELECT_COLUMNS = `${BASE_COLUMNS}, book_type`;

/** Pre-migration databases have no `book_type` column yet (PostgREST 42703). */
function isMissingBookTypeColumn(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? "");
  return /book_type/.test(message) && /(does not exist|42703|column)/i.test(message);
}

export function normalizeBookType(value: unknown): TextbookBookType {
  return value === "EXERCISE_BOOK" || value === "OTHER" ? value : "MAIN_TEXTBOOK";
}

export function mapTextbook(row: Record<string, unknown>): SubjectTextbook {
  return {
    id: String(row["id"]),
    subjectId: String(row["subject_id"]),
    curriculumTrackId: (row["curriculum_track_id"] as string | null) ?? null,
    bookType: normalizeBookType(row["book_type"]),
    coverageType:
      row["coverage_type"] === "SEMESTER_SPECIFIC" ? "SEMESTER_SPECIFIC" : "FULL_ACADEMIC_YEAR",
    semester: (row["semester"] as 1 | 2 | null) ?? null,
    title: String(row["title"] ?? ""),
    fileName: (row["file_name"] as string | null) ?? null,
    fileSize: (row["file_size"] as number | null) ?? null,
    version: String(row["version"] ?? "0"),
    sha256: (row["sha256"] as string | null) ?? null,
    sortOrder: Number(row["sort_order"] ?? 0),
    isActive: Boolean(row["is_active"]),
    updatedAt: (row["updated_at"] as string | null) ?? null,
  };
}

/** Student/admin display order: main book, then exercise book, then extras. */
export function sortTextbooks<T extends { bookType: TextbookBookType; sortOrder: number }>(
  books: T[],
): T[] {
  return [...books].sort(
    (a, b) => BOOK_TYPE_RANK[a.bookType] - BOOK_TYPE_RANK[b.bookType] || a.sortOrder - b.sortOrder,
  );
}

/** Coverage contract (21B-A2): full-year books never carry a semester. */
export function normalizeCoverage(input: {
  coverageType?: TextbookCoverage | null;
  semester?: number | null;
}): { coverageType: TextbookCoverage; semester: 1 | 2 | null } {
  const coverageType: TextbookCoverage =
    input.coverageType === "SEMESTER_SPECIFIC" ? "SEMESTER_SPECIFIC" : "FULL_ACADEMIC_YEAR";
  if (coverageType === "FULL_ACADEMIC_YEAR") return { coverageType, semester: null };
  if (input.semester !== 1 && input.semester !== 2) throw new Error("semester_required");
  return { coverageType, semester: input.semester };
}

function makeVersion(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function assertContentStaff(supabase: Caller, userId: string) {
  const { data, error } = await supabase.rpc("is_content_staff", { _user_id: userId });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

export async function listSubjectTextbooks(
  admin: Caller,
  params: { subjectId: string; includeInactive?: boolean },
): Promise<SubjectTextbook[]> {
  const run = async (columns: string) => {
    let query = (admin as unknown as Loose)
      .from("subject_textbooks")
      .select(columns)
      .eq("subject_id", params.subjectId)
      .order("sort_order", { ascending: true });
    if (!params.includeInactive) query = query.eq("is_active", true);
    return query;
  };

  let { data, error } = await run(SELECT_COLUMNS);
  if (error && isMissingBookTypeColumn(error)) ({ data, error } = await run(BASE_COLUMNS));
  if (error) throw new Error("textbook_lookup_failed");
  return sortTextbooks(((data ?? []) as Record<string, unknown>[]).map(mapTextbook));
}


export function validateUploadInput(fileName: string, fileSize: number) {
  if (!/\.pdf$/i.test(fileName)) throw new Error("invalid_extension");
  if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("empty_file");
  if (fileSize > MAX_TEXTBOOK_BYTES) throw new Error("file_too_large");
}

/** Signed upload target — the system, not the operator, owns the path. */
export async function createTextbookUploadTarget(
  admin: Caller,
  subjectId: string,
  fileName: string,
  fileSize: number,
) {
  validateUploadInput(fileName, fileSize);

  const { data: subject, error: subjectError } = await admin
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectError) throw new Error("subject_lookup_failed");
  if (!subject) throw new Error("subject_not_found");

  const path = `${TEXTBOOK_PATH_PREFIX}/${subjectId}/${crypto.randomUUID()}.pdf`;
  const { data, error } = await admin.storage
    .from(TEXTBOOK_BUCKET)
    .createSignedUploadUrl(path, { upsert: false } as never);
  if (error || !data?.token) throw new Error("upload_target_failed");

  return { bucket: TEXTBOOK_BUCKET, path, token: data.token, expiresIn: UPLOAD_URL_TTL };
}

/**
 * Bind uploaded bytes as a textbook row, or REPLACE an existing one
 * (identity preserved, `version` + `sha256` bumped so every cached copy of the
 * previous file is invalidated by the 18C version check).
 */
export async function bindSubjectTextbook(
  admin: Caller,
  userId: string,
  input: {
    subjectId: string;
    curriculumTrackId: string | null;
    bookType?: TextbookBookType | null;
    coverageType?: TextbookCoverage | null;
    semester?: number | null;
    title: string;
    path: string;
    fileName: string;
    fileSize: number;
    sha256: string | null;
    replaceId?: string | null;
  },
) {
  if (!input.path.startsWith(`${TEXTBOOK_PATH_PREFIX}/${input.subjectId}/`)) {
    throw new Error("path_not_owned");
  }
  validateUploadInput(input.fileName, input.fileSize);

  const objects = await admin.storage
    .from(TEXTBOOK_BUCKET)
    .list(`${TEXTBOOK_PATH_PREFIX}/${input.subjectId}`, {
      search: input.path.split("/").pop(),
    });
  if (objects.error) throw new Error("object_lookup_failed");
  if (!objects.data || objects.data.length === 0) throw new Error("object_missing");

  const version = makeVersion();
  const coverage = normalizeCoverage(input);
  const bookType = normalizeBookType(input.bookType);
  const title = input.title.trim() || "كتاب المنهج";
  const db = admin as unknown as Loose;

  if (input.replaceId) {
    const { data: previous, error: prevError } = await db
      .from("subject_textbooks")
      .select("id, subject_id, storage_path")
      .eq("id", input.replaceId)
      .maybeSingle();
    if (prevError) throw new Error("textbook_lookup_failed");
    if (!previous) throw new Error("textbook_not_found");
    if (previous.subject_id !== input.subjectId) throw new Error("wrong_subject_binding");

    const patch: Record<string, unknown> = {
      title,
      curriculum_track_id: input.curriculumTrackId,
      coverage_type: coverage.coverageType,
      semester: coverage.semester,
      storage_path: input.path,
      file_name: input.fileName,
      file_size: input.fileSize,
      sha256: input.sha256,
      version,
      is_active: true,
    };
    let { error } = await db
      .from("subject_textbooks")
      .update({ ...patch, book_type: bookType })
      .eq("id", input.replaceId);
    if (error && isMissingBookTypeColumn(error)) {
      ({ error } = await db.from("subject_textbooks").update(patch).eq("id", input.replaceId));
    }
    if (error) throw new Error(error.message || "textbook_update_failed");

    // Drop the previous bytes only when nothing else references them.
    if (previous.storage_path && previous.storage_path !== input.path) {
      const { data: stillUsed } = await db
        .from("subject_textbooks")
        .select("id")
        .eq("storage_path", previous.storage_path)
        .limit(1);
      if (!stillUsed || stillUsed.length === 0) {
        await admin.storage.from(TEXTBOOK_BUCKET).remove([previous.storage_path]);
      }
    }

    return { textbookId: input.replaceId, replaced: true, version };
  }

  const row: Record<string, unknown> = {
    subject_id: input.subjectId,
    curriculum_track_id: input.curriculumTrackId,
    coverage_type: coverage.coverageType,
    semester: coverage.semester,
    title,
    storage_bucket: TEXTBOOK_BUCKET,
    storage_path: input.path,
    file_name: input.fileName,
    file_size: input.fileSize,
    sha256: input.sha256,
    version,
    created_by: userId,
  };
  let { data, error } = await db
    .from("subject_textbooks")
    .insert({ ...row, book_type: bookType })
    .select("id")
    .single();
  if (error && isMissingBookTypeColumn(error)) {
    ({ data, error } = await db.from("subject_textbooks").insert(row).select("id").single());
  }
  if (error) throw new Error(error.message || "textbook_insert_failed");

  return { textbookId: String(data.id), replaced: false, version };
}


/** Reuse the very same bytes for another track (NO duplicated storage object). */
export async function cloneTextbookForTrack(
  admin: Caller,
  userId: string,
  input: { textbookId: string; curriculumTrackId: string | null },
) {
  const db = admin as unknown as Loose;
  const { data: source, error } = await db
    .from("subject_textbooks")
    .select("*")
    .eq("id", input.textbookId)
    .maybeSingle();
  if (error) throw new Error("textbook_lookup_failed");
  if (!source) throw new Error("textbook_not_found");

  const { data, error: insertError } = await db
    .from("subject_textbooks")
    .insert({
      subject_id: source.subject_id,
      curriculum_track_id: input.curriculumTrackId,
      coverage_type: source.coverage_type ?? "FULL_ACADEMIC_YEAR",
      semester: source.semester ?? null,
      title: source.title,
      storage_bucket: source.storage_bucket,
      storage_path: source.storage_path,
      file_name: source.file_name,
      file_size: source.file_size,
      sha256: source.sha256,
      version: makeVersion(),
      created_by: userId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message || "textbook_insert_failed");
  return { textbookId: String(data.id) };
}

export async function setTextbookActive(admin: Caller, textbookId: string, isActive: boolean) {
  const { error } = await (admin as unknown as Loose)
    .from("subject_textbooks")
    .update({ is_active: isActive })
    .eq("id", textbookId);
  if (error) throw new Error("textbook_update_failed");
  return { textbookId, isActive };
}

export async function deleteTextbook(admin: Caller, textbookId: string) {
  const db = admin as unknown as Loose;
  const { data: row, error } = await db
    .from("subject_textbooks")
    .select("id, storage_path")
    .eq("id", textbookId)
    .maybeSingle();
  if (error) throw new Error("textbook_lookup_failed");
  if (!row) return { deleted: false };

  const { error: deleteError } = await db.from("subject_textbooks").delete().eq("id", textbookId);
  if (deleteError) throw new Error("textbook_delete_failed");

  const { data: stillUsed } = await db
    .from("subject_textbooks")
    .select("id")
    .eq("storage_path", row.storage_path)
    .limit(1);
  if (!stillUsed || stillUsed.length === 0) {
    await admin.storage.from(TEXTBOOK_BUCKET).remove([row.storage_path]);
  }
  return { deleted: true };
}
