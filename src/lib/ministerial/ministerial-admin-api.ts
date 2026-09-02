/**
 * PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 — admin client bindings.
 *
 * RPC-ONLY WRITES: this module NEVER issues a direct PostgREST
 * insert/update/delete against ministerial_exam_models or
 * ministerial_exam_questions. Every write goes through a protected RPC that
 * performs authorization, validation, audit and an atomic transaction.
 */

import { supabase } from "@/integrations/supabase/client";
import type { PreviewAction } from "./ministerial-import-contract";
import type { MinisterialTrackPackage } from "./ministerial-package-xlsx";

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
  };
  preview: MinisterialPackagePreviewRow[];
  expires_in_minutes: number;
};

export type MinisterialPackageExecuteResult = {
  inserted_models: number;
  inserted_questions: number;
  skipped_models: number;
  published_models: 0;
  status: "draft";
};

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
