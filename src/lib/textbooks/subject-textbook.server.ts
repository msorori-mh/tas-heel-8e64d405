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

export type SubjectTextbook = {
  id: string;
  subjectId: string;
  curriculumTrackId: string | null;
  semester: number | null;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  version: string;
  sha256: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string | null;
};

const SELECT_COLUMNS =
  "id, subject_id, curriculum_track_id, semester, title, file_name, file_size, version, sha256, sort_order, is_active, updated_at";

export function mapTextbook(row: Record<string, unknown>): SubjectTextbook {
  return {
    id: String(row["id"]),
    subjectId: String(row["subject_id"]),
    curriculumTrackId: (row["curriculum_track_id"] as string | null) ?? null,
    semester: (row["semester"] as number | null) ?? null,
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
  let query = (admin as unknown as Loose)
    .from("subject_textbooks")
    .select(SELECT_COLUMNS)
    .eq("subject_id", params.subjectId)
    .order("semester", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true });
  if (!params.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error("textbook_lookup_failed");
  return ((data ?? []) as Record<string, unknown>[]).map(mapTextbook);
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
    semester: number | null;
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

    const { error } = await db
      .from("subject_textbooks")
      .update({
        title,
        curriculum_track_id: input.curriculumTrackId,
        semester: input.semester,
        storage_path: input.path,
        file_name: input.fileName,
        file_size: input.fileSize,
        sha256: input.sha256,
        version,
        is_active: true,
      })
      .eq("id", input.replaceId);
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

  const { data, error } = await db
    .from("subject_textbooks")
    .insert({
      subject_id: input.subjectId,
      curriculum_track_id: input.curriculumTrackId,
      semester: input.semester,
      title,
      storage_bucket: TEXTBOOK_BUCKET,
      storage_path: input.path,
      file_name: input.fileName,
      file_size: input.fileSize,
      sha256: input.sha256,
      version,
      created_by: userId,
    })
    .select("id")
    .single();
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
      semester: source.semester,
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
