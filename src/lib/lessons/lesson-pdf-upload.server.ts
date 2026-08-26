/**
 * 18D — direct PDF upload + lesson binding (server-only logic).
 *
 * Contract:
 *   admin/content-staff uploads the PDF binary -> private `lesson-pdfs` bucket
 *   -> lesson_resources row (resource_type = 'pdf', is_primary = true)
 *   -> student reads it exclusively through the 18C secure delivery route.
 *
 * The operator NEVER supplies a URL, a bucket, or a storage path: the server
 * owns the path (`<lessonId>/<uuid>.pdf`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const LESSON_PDF_BUCKET = "lesson-pdfs";
export const MAX_LESSON_PDF_BYTES = 100 * 1024 * 1024;
const UPLOAD_URL_TTL = 900;

type Caller = SupabaseClient<Database>;

export type PrimaryPdfState = {
  resourceId: string;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  version: string;
  managed: boolean;
  storagePath: string | null;
};

function makeVersion(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function makeUuid(): string {
  return crypto.randomUUID();
}

export async function assertContentStaff(supabase: Caller, userId: string) {
  const { data, error } = await supabase.rpc("is_content_staff", { _user_id: userId });
  if (error) throw new Error("role_check_failed");
  if (!data) throw new Error("forbidden");
}

function metaOf(row: { metadata: unknown }): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object"
    ? (row.metadata as Record<string, unknown>)
    : {};
}

export function toPrimaryState(row: {
  id: string;
  title: string;
  url: string;
  created_at: string | null;
  metadata: unknown;
}): PrimaryPdfState {
  const meta = metaOf(row);
  const managed = meta["source"] === "direct_upload";
  return {
    resourceId: row.id,
    title: row.title,
    fileName: (meta["file_name"] as string) ?? null,
    fileSize: typeof meta["file_size"] === "number" ? (meta["file_size"] as number) : null,
    uploadedAt: (meta["uploaded_at"] as string) ?? row.created_at,
    version: (meta["version"] as string) ?? String(Date.parse(row.created_at ?? "") || 0),
    managed,
    storagePath: managed ? ((meta["path"] as string) ?? null) : null,
  };
}

export async function loadPrimaryPdf(
  admin: Caller,
  lessonId: string,
): Promise<PrimaryPdfState | null> {
  const { data, error } = await admin
    .from("lesson_resources")
    .select("id, title, url, created_at, metadata, resource_type, is_primary")
    .eq("lesson_id", lessonId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw new Error("primary_lookup_failed");
  if (!data) return null;
  if (data.resource_type !== "pdf") return null;
  return toPrimaryState(data as never);
}

/** Signed upload target — the system, not the operator, owns the path. */
export async function createUploadTarget(
  admin: Caller,
  lessonId: string,
  fileName: string,
  fileSize: number,
) {
  if (!/\.pdf$/i.test(fileName)) throw new Error("invalid_extension");
  if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("empty_file");
  if (fileSize > MAX_LESSON_PDF_BYTES) throw new Error("file_too_large");

  const { data: lesson, error: lessonError } = await admin
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) throw new Error("lesson_lookup_failed");
  if (!lesson) throw new Error("lesson_not_found");

  const path = `${lessonId}/${makeUuid()}.pdf`;
  const { data, error } = await admin.storage
    .from(LESSON_PDF_BUCKET)
    .createSignedUploadUrl(path, { upsert: false } as never);
  if (error || !data?.token) throw new Error("upload_target_failed");

  return {
    bucket: LESSON_PDF_BUCKET,
    path,
    token: data.token,
    expiresIn: UPLOAD_URL_TTL,
  };
}

/**
 * 18E1 — find an already-uploaded (possibly unbound) object for a lesson so a
 * failed bind can be retried without re-uploading the bytes.
 */
export async function findUploadedLessonPdf(admin: Caller, lessonId: string) {
  const { data, error } = await admin.storage
    .from(LESSON_PDF_BUCKET)
    .list(lessonId, { limit: 100, sortBy: { column: "created_at", order: "desc" } } as never);
  if (error) throw new Error("object_lookup_failed");
  const objects = (data ?? []).filter((o) => /\.pdf$/i.test(o.name));
  if (objects.length === 0)
    return { objects: [], latest: null as null | { path: string; size: number } };
  const mapped = objects.map((o) => ({
    path: `${lessonId}/${o.name}`,
    size: Number((o as { metadata?: { size?: number } }).metadata?.size ?? 0),
  }));
  return { objects: mapped, latest: mapped[0] ?? null };
}

/**
 * Bind an already-uploaded object to the lesson as PRIMARY_CONTENT.
 * A lesson never ends up with two primary resources: the previous managed
 * primary row is reused (identity preserved) and its bytes are replaced.
 */
export async function bindPrimaryPdf(
  admin: Caller,
  caller: Caller,
  lessonId: string,
  input: { path: string; fileName: string; fileSize: number; title?: string | null },
) {
  if (!input.path.startsWith(`${lessonId}/`)) throw new Error("path_not_owned");

  const { data: object, error: statError } = await admin.storage
    .from(LESSON_PDF_BUCKET)
    .list(lessonId, { search: input.path.split("/").pop() });
  if (statError) throw new Error("object_lookup_failed");
  if (!object || object.length === 0) throw new Error("object_missing");

  const existing = await loadPrimaryPdf(admin, lessonId);
  const url = `${LESSON_PDF_BUCKET}/${input.path}`;
  const metadata = {
    source: "direct_upload",
    bucket: LESSON_PDF_BUCKET,
    path: input.path,
    file_name: input.fileName,
    file_size: input.fileSize,
    uploaded_at: new Date().toISOString(),
    version: makeVersion(),
  };
  const title = (input.title ?? "").trim() || "ملف الدرس (PDF)";

  let resourceId: string;
  let replaced = false;
  let previousPath: string | null = null;

  if (existing && existing.managed) {
    previousPath = existing.storagePath;
    replaced = true;
    const { error } = await admin
      .from("lesson_resources")
      .update({ url, metadata, resource_type: "pdf", title })
      .eq("id", existing.resourceId);
    if (error) throw new Error("resource_update_failed");
    resourceId = existing.resourceId;
  } else if (existing) {
    // Legacy (URL-based) primary: keep the row, repoint it at the uploaded file.
    replaced = true;
    const { error } = await admin
      .from("lesson_resources")
      .update({ url, metadata, resource_type: "pdf", title })
      .eq("id", existing.resourceId);
    if (error) throw new Error("resource_update_failed");
    resourceId = existing.resourceId;
  } else {
    const { data, error } = await admin
      .from("lesson_resources")
      .insert({
        lesson_id: lessonId,
        title,
        resource_type: "pdf",
        url,
        sort_order: 0,
        metadata,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("resource_insert_failed");
    resourceId = data.id;
  }

  // Primary flag + delivery_mode derivation stay in the existing 13F RPC,
  // executed as the caller so the role gate is enforced by the database.
  const { error: primaryError } = await caller.rpc("admin_set_primary_lesson_resource", {
    _lesson_id: lessonId,
    _resource_id: resourceId,
  });
  if (primaryError) throw new Error("primary_binding_failed");

  if (previousPath && previousPath !== input.path) {
    await admin.storage.from(LESSON_PDF_BUCKET).remove([previousPath]);
  }

  return { resourceId, replaced, version: metadata.version };
}

export async function deletePrimaryPdf(admin: Caller, caller: Caller, lessonId: string) {
  const existing = await loadPrimaryPdf(admin, lessonId);
  if (!existing) return { deleted: false, lessonStudentReady: false };

  const { error: clearError } = await caller.rpc("admin_set_primary_lesson_resource", {
    _lesson_id: lessonId,
    _resource_id: null as unknown as string,
  });
  if (clearError) throw new Error("primary_clear_failed");

  const { error } = await admin.from("lesson_resources").delete().eq("id", existing.resourceId);
  if (error) throw new Error("resource_delete_failed");

  if (existing.storagePath) {
    await admin.storage.from(LESSON_PDF_BUCKET).remove([existing.storagePath]);
  }

  const { count } = await admin
    .from("lesson_resources")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);

  return { deleted: true, lessonStudentReady: (count ?? 0) > 0 };
}
