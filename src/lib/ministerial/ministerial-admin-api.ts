/**
 * PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 — admin client bindings.
 *
 * RPC-ONLY WRITES: this module NEVER issues a direct PostgREST
 * insert/update/delete against ministerial_exam_models or
 * ministerial_exam_questions. Every write goes through a protected RPC that
 * performs authorization, validation, audit and an atomic transaction.
 *
 * MINISTERIAL_QUESTION_MEDIA_V1: the only direct storage write is the upload
 * of image bytes to the PRIVATE `question-media` bucket under a
 * content-addressed key (RLS: content staff only). Linking media to a question
 * still happens exclusively inside the prepare/execute/update RPCs, which
 * verify the object exists before committing.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PreviewAction } from "./ministerial-import-contract";
import {
  MINISTERIAL_MEDIA_LIMITS,
  MINISTERIAL_MEDIA_STORAGE_KEY_RE,
  QUESTION_MEDIA_BUCKET,
  detectImageMime,
  mimeForExtension,
  ministerialMediaStorageKey,
  sha256HexOf,
  type MinisterialImageMimeType,
  type MinisterialMediaPlacement,
  type MinisterialPackageMedia,
} from "./ministerial-media-contract";
import type { MinisterialMediaFile, MinisterialTrackPackage } from "./ministerial-package-xlsx";

/** RPCs shipped by the pending 14C.2 migration (not yet in generated types). */
type RpcName =
  | "ministerial_models_admin_list"
  | "ministerial_m01_prepare"
  | "ministerial_m01_execute"
  | "ministerial_m02_prepare"
  | "ministerial_m02_execute"
  | "ministerial_track_package_prepare"
  | "ministerial_track_package_execute"
  | "ministerial_membership_remove_preview"
  | "ministerial_membership_remove_execute"
  | "ministerial_model_questions_admin_list"
  | "ministerial_model_question_update"
  | "ministerial_model_question_delete"
  | "ministerial_model_set_status"
  | "publish_ministerial_model";

async function callRpc<T>(name: RpcName, args?: Record<string, unknown>): Promise<T> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      params?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(name, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type MinisterialModelRow = {
  id: string;
  model_code: string;
  model_label: string | null;
  status: "draft" | "published" | "archived";
  academic_year: number;
  round_code: string;
  variant_code: string;
  subject_name: string;
  subject_code: string;
  grade_name: string | null;
  grade_slug: string | null;
  track_code: string;
  track_name: string;
  question_count: number;
  can_publish: boolean;
};

/** Media attached to the currently published revision of a model question. */
export type MinisterialAdminQuestionMedia = {
  media_id: string;
  placement: MinisterialMediaPlacement;
  alt_text_ar: string;
  mime_type: string;
  file_size: number | null;
  sha256: string | null;
};

export type MinisterialAdminQuestion = {
  question_id: string;
  question_code: string;
  question_text: string;
  display_order: number;
  marks: number;
  options: Array<{ option_code: "A" | "B" | "C" | "D"; body: string; is_correct: boolean }>;
  model_answer: string | null;
  explanation: string | null;
  media: MinisterialAdminQuestionMedia[];
  /** True once any student session exists for the model: edits are blocked server-side. */
  has_sessions: boolean;
};

export type MinisterialPreviewRow = {
  row_number: number;
  action: PreviewAction;
  blocked_reason: string | null;
  model_code?: string | null;
  subject_code?: string | null;
  subject_name?: string | null;
  track_code?: string | null;
  academic_year?: string | null;
  round_code?: string | null;
  variant_code?: string | null;
  question_code?: string | null;
  question_id?: string | null;
  pinned_revision_id?: string | null;
  original_question_number?: string | null;
  marks?: string | null;
  display_order?: string | null;
};

export type MinisterialPrepareResult = {
  prepare_id: string;
  summary: { rows: number; insert: number; update: number; skip: number; blocked: number };
  preview: MinisterialPreviewRow[];
};

export type MinisterialExecuteResult = {
  inserted: number;
  updated: number;
  skipped: number;
  blocked: number;
};

export type MinisterialPackagePreviewRow = {
  model_code: string;
  model_label: string;
  academic_year: number;
  track_code: "sanaa" | "aden";
  question_count: number;
  fingerprint: string;
  action: "INSERT" | "SKIP" | "BLOCKED";
  blocked_reason: string | null;
};

export type MinisterialPackagePrepareResult = {
  prepare_id: string;
  prepare_fingerprint: string;
  summary: {
    models: number;
    questions: number;
    insert: number;
    skip: number;
    blocked: number;
    /** v2 packages only (absent on the v1 RPC response). */
    media_refs?: number;
    media_files?: number;
    media_bytes?: number;
  };
  preview: MinisterialPackagePreviewRow[];
  expires_in_minutes: number;
};

export type MinisterialPackageExecuteResult = {
  inserted_models: number;
  inserted_questions: number;
  /** Absent on the pre-media RPC response. */
  inserted_media?: number;
  skipped_models: number;
  published_models: 0;
  status: "draft";
};

// ---------------------------------------------------------------------------
// Media upload (content staff → private bucket, content-addressed)
// ---------------------------------------------------------------------------

export type MinisterialMediaUploadProgress = {
  done: number;
  total: number;
  uploaded: number;
  reused: number;
  currentName: string | null;
};

function storageErrorLooksLikeExists(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already exists") || lower.includes("duplicate") || lower.includes("409")
  );
}

async function objectExists(storageKey: string): Promise<boolean> {
  const slash = storageKey.lastIndexOf("/");
  const folder = storageKey.slice(0, slash);
  const name = storageKey.slice(slash + 1);
  const { data, error } = await supabase.storage
    .from(QUESTION_MEDIA_BUCKET)
    .list(folder, { limit: 1, search: name });
  if (error) return false;
  return (data ?? []).some((entry) => entry.name === name);
}

async function uploadOne(file: MinisterialMediaFile): Promise<"uploaded" | "reused"> {
  if (!MINISTERIAL_MEDIA_STORAGE_KEY_RE.test(file.storage_key)) {
    throw new Error(`مفتاح تخزين غير صالح للصورة (${file.file_names[0] ?? file.sha256}).`);
  }
  if (await objectExists(file.storage_key)) return "reused";
  const body = new Blob([file.bytes as BlobPart], { type: file.mime_type });
  const { error } = await supabase.storage.from(QUESTION_MEDIA_BUCKET).upload(file.storage_key, body, {
    contentType: file.mime_type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    // Content-addressed: an identical object under the same key is not a failure.
    if (storageErrorLooksLikeExists(error.message)) return "reused";
    throw new Error(
      `فشل رفع الصورة «${file.file_names[0] ?? file.sha256}»: ${error.message}. تأكد من صلاحيات فريق المحتوى وأن الحاوية question-media موجودة.`,
    );
  }
  return "uploaded";
}

/**
 * Uploads every de-duplicated image of a parsed package. Keys are derived from
 * the SHA-256 so re-running an import never creates duplicates. Runs BEFORE
 * execute; the execute RPC then verifies each object exists with the declared
 * size and mime type inside the same transaction.
 */
export async function uploadMinisterialPackageMedia(
  files: readonly MinisterialMediaFile[],
  onProgress?: (progress: MinisterialMediaUploadProgress) => void,
): Promise<{ uploaded: number; reused: number }> {
  let uploaded = 0;
  let reused = 0;
  const total = files.length;
  for (const [index, file] of files.entries()) {
    onProgress?.({ done: index, total, uploaded, reused, currentName: file.file_names[0] ?? null });
    const outcome = await uploadOne(file);
    if (outcome === "uploaded") uploaded += 1;
    else reused += 1;
  }
  onProgress?.({ done: total, total, uploaded, reused, currentName: null });
  return { uploaded, reused };
}

/**
 * Reads, validates (magic bytes, size, extension) and uploads one image picked
 * in the admin question editor. Returns the package-media descriptor the
 * update RPC expects.
 */
export async function uploadMinisterialQuestionImage(input: {
  file: File;
  placement: MinisterialMediaPlacement;
  altText: string;
}): Promise<MinisterialPackageMedia> {
  const { file, placement } = input;
  if (file.size === 0) throw new Error("الصورة فارغة.");
  if (file.size > MINISTERIAL_MEDIA_LIMITS.maxImageBytes) {
    throw new Error("الصورة تتجاوز الحد الأقصى (8MB).");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = detectImageMime(bytes);
  if (!sniffed) throw new Error("الملف ليس PNG أو JPEG أو WebP صالحًا (SVG غير مقبول).");
  const byExtension = mimeForExtension(file.name);
  if (byExtension && byExtension !== sniffed) {
    throw new Error(`امتداد الملف لا يطابق محتواه الفعلي (${sniffed}).`);
  }
  const altText = input.altText.trim();
  if (!altText) throw new Error("اكتب وصفًا للصورة (نص بديل).");
  if (altText.length > MINISTERIAL_MEDIA_LIMITS.maxAltTextChars) {
    throw new Error(`الوصف يتجاوز ${MINISTERIAL_MEDIA_LIMITS.maxAltTextChars} حرفًا.`);
  }
  const sha256 = await sha256HexOf(bytes);
  const mime: MinisterialImageMimeType = sniffed;
  const mediaFile: MinisterialMediaFile = {
    sha256,
    mime_type: mime,
    file_size: bytes.byteLength,
    storage_key: ministerialMediaStorageKey(sha256, mime),
    bytes,
    file_names: [file.name.slice(0, MINISTERIAL_MEDIA_LIMITS.maxFileNameChars)],
  };
  await uploadOne(mediaFile);
  return {
    placement,
    file_name: mediaFile.file_names[0]!,
    sha256,
    mime_type: mime,
    file_size: bytes.byteLength,
    alt_text_ar: altText,
  };
}

export function listMinisterialModels(): Promise<MinisterialModelRow[]> {
  return callRpc<MinisterialModelRow[]>("ministerial_models_admin_list");
}

export function prepareM01(rows: Record<string, unknown>[]): Promise<MinisterialPrepareResult> {
  return callRpc<MinisterialPrepareResult>("ministerial_m01_prepare", { _rows: rows });
}

export function executeM01(prepareId: string): Promise<MinisterialExecuteResult> {
  return callRpc<MinisterialExecuteResult>("ministerial_m01_execute", { _prepare_id: prepareId });
}

export function prepareM02(rows: Record<string, unknown>[]): Promise<MinisterialPrepareResult> {
  return callRpc<MinisterialPrepareResult>("ministerial_m02_prepare", { _rows: rows });
}

export function executeM02(prepareId: string): Promise<MinisterialExecuteResult> {
  return callRpc<MinisterialExecuteResult>("ministerial_m02_execute", { _prepare_id: prepareId });
}

export function prepareMinisterialTrackPackage(
  packagePayload: MinisterialTrackPackage,
): Promise<MinisterialPackagePrepareResult> {
  return callRpc<MinisterialPackagePrepareResult>("ministerial_track_package_prepare", {
    _package: packagePayload,
  });
}

export function executeMinisterialTrackPackage(
  prepareId: string,
  expectedFingerprint: string,
): Promise<MinisterialPackageExecuteResult> {
  return callRpc<MinisterialPackageExecuteResult>("ministerial_track_package_execute", {
    _prepare_id: prepareId,
    _expected_fingerprint: expectedFingerprint,
  });
}

/** Publish never re-implements gates client-side; it just calls the protected RPC. */
export function publishMinisterialModel(modelId: string): Promise<void> {
  return callRpc<void>("publish_ministerial_model", { _model_id: modelId });
}

export function setMinisterialModelStatus(
  modelId: string,
  targetStatus: "draft" | "archived",
  reason: string,
): Promise<void> {
  return callRpc<void>("ministerial_model_set_status", {
    _model_id: modelId,
    _target_status: targetStatus,
    _reason: reason,
  });
}

export function previewMembershipRemoval(modelId: string, questionCodes: string[]) {
  return callRpc<Record<string, unknown>>("ministerial_membership_remove_preview", {
    _model_id: modelId,
    _question_codes: questionCodes,
  });
}

export function executeMembershipRemoval(modelId: string, questionCodes: string[], reason: string) {
  return callRpc<{ removed: number }>("ministerial_membership_remove_execute", {
    _model_id: modelId,
    _question_codes: questionCodes,
    _reason: reason,
  });
}

export function listMinisterialModelQuestions(modelId: string) {
  return callRpc<MinisterialAdminQuestion[]>("ministerial_model_questions_admin_list", {
    _model_id: modelId,
  });
}

/**
 * Every edit creates a NEW published revision; the previous one is superseded,
 * never mutated. `media` semantics:
 *   - `undefined` → keep the current images unchanged (copied to the new revision)
 *   - `[]`        → remove all images
 *   - `[...]`     → exact new media set (objects must already be uploaded)
 * The RPC refuses when any student session exists for the model.
 */
export function updateMinisterialModelQuestion(
  modelId: string,
  question: MinisterialAdminQuestion,
  reason: string,
  media?: MinisterialPackageMedia[],
) {
  const correct = question.options.find((option) => option.is_correct)?.option_code ?? null;
  return callRpc<{
    question_id: string;
    published_revision_id: string;
    status: "draft";
    media_count?: number;
  }>("ministerial_model_question_update", {
    _model_id: modelId,
    _question_id: question.question_id,
    _question_text: question.question_text,
    _options: question.options,
    _correct_option_code: correct,
    _model_answer: question.model_answer,
    _explanation: question.explanation,
    _display_order: question.display_order,
    _marks: question.marks,
    _reason: reason,
    ...(media === undefined ? {} : { _media: media }),
  });
}

export function deleteMinisterialModelQuestion(
  modelId: string,
  questionId: string,
  reason: string,
) {
  return callRpc<{ removed: number; status: "draft" }>("ministerial_model_question_delete", {
    _model_id: modelId,
    _question_id: questionId,
    _reason: reason,
  });
}
