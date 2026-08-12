/**
 * IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03 — staging server layer.
 *
 * Server-only. Never imported by components.
 *
 * Boundaries:
 *   validate (dry-run) → zero persistence, lives in content-import-dry-run.*
 *   prepare (here)     → import_jobs + import_staging_rows, zero domain writes
 *   execute (here)     → one RPC per template; the transaction lives in the DB
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ContentImportTemplateKey } from "../content-import/content-import-templates";
import type { ContentImportParsedSheet } from "../content-import/content-import-types";
import { IMPORT_ENTITY_CONTRACTS } from "./import-contract";
import {
  assertNoDuplicateNaturalKeys,
  buildNaturalKey,
  buildStagingPayload,
  computeRowHash,
} from "./import-row-hash";
import { IMPORT_RPC, assertGenericUpsertAllowed } from "./import-execution-state";
import { canonicalSubjectCodeInput, planSubjectSlugs } from "./subject-slug";

export interface StagingRowInput {
  sheet_name: string | null;
  row_number: number;
  natural_key: string;
  row_hash: string;
  payload: Record<string, unknown>;
  resolved_refs: Record<string, unknown>;
  planned_action: "INSERT" | "UPDATE_DRAFT" | "NEW_REVISION" | "SKIP" | "BLOCKED_PUBLISHED";
  is_valid: boolean;
}

/** Untyped RPC bridge: these functions ship with the phase-03 migration. */
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function asRpcClient(supabase: SupabaseClient<Database>): RpcClient {
  return supabase as unknown as RpcClient;
}

/**
 * Build staging rows from a validated sheet. Pure transformation — no DB access.
 * Subject slugs are planned here and fail closed on collision.
 */
export function buildStagingRows(
  templateKey: ContentImportTemplateKey,
  parsed: ContentImportParsedSheet,
  sheetName: string | null = null,
): StagingRowInput[] {
  const rows: StagingRowInput[] = parsed.rows.map((row) => {
    const payload = buildStagingPayload(templateKey, row.data) as Record<string, unknown>;
    return {
      sheet_name: sheetName,
      row_number: row.rowNumber,
      natural_key: buildNaturalKey(templateKey, row.data),
      row_hash: computeRowHash(templateKey, row.data),
      payload,
      resolved_refs: {},
      // The authoritative action is recomputed inside the execute transaction.
      planned_action: "INSERT",
      is_valid: true,
    };
  });

  assertNoDuplicateNaturalKeys(
    rows.map((r) => ({ naturalKey: r.natural_key, rowNumber: r.row_number })),
    templateKey,
  );

  if (templateKey === "subjects") {
    const codes = rows.map((r) => String(r.payload["subject_code"] ?? ""));
    const slugs = planSubjectSlugs(codes);
    rows.forEach((r, i) => {
      const code = canonicalSubjectCodeInput(codes[i] ?? "");
      const slug = slugs.get(code);
      if (!slug) throw new Error(`SUBJECT_SLUG_UNRESOLVED: row ${r.row_number}`);
      r.payload["slug"] = slug;
    });
  }

  return rows;
}

/** prepare/stage — the only write path into import_staging_rows. */
export async function stageContentImportRows(
  supabase: SupabaseClient<Database>,
  jobId: string,
  templateKey: ContentImportTemplateKey,
  rows: StagingRowInput[],
): Promise<{ stagedRows: number }> {
  const { data, error } = await asRpcClient(supabase).rpc(IMPORT_RPC.stage, {
    _job_id: jobId,
    _template_key: templateKey,
    _rows: rows,
  });

  if (error) throw new Error(`تعذر تجهيز صفوف الاستيراد: ${error.message}`);

  const result = (data ?? {}) as { staged_rows?: number };
  return { stagedRows: result.staged_rows ?? rows.length };
}

export interface ExecuteTemplateResult {
  templateKey: ContentImportTemplateKey;
  inserted: number;
  updated: number;
  skipped: number;
  blockedPublished: number;
}

/**
 * execute — one RPC call per template. The whole template is applied inside a
 * single database transaction, so a failing row rolls the template back entirely.
 * Templates run in contract dependency order and a failure aborts the rest.
 */
export async function executeContentImport(
  supabase: SupabaseClient<Database>,
  jobId: string,
  templateKeys: readonly ContentImportTemplateKey[],
): Promise<{ results: ExecuteTemplateResult[]; failedTemplate: ContentImportTemplateKey | null; error: string | null }> {
  const ordered = orderTemplatesByDependency(templateKeys);
  const results: ExecuteTemplateResult[] = [];

  for (const templateKey of ordered) {
    // Template 09 has its own workflow and its own transaction boundary.
    assertGenericUpsertAllowed(templateKey);

    const { data, error } = await asRpcClient(supabase).rpc(IMPORT_RPC.execute, {
      _job_id: jobId,
      _template_key: templateKey,
    });

    if (error) {
      await asRpcClient(supabase)
        .rpc(IMPORT_RPC.finalize, { _job_id: jobId, _succeeded: false, _error_message: error.message })
        .catch(() => undefined);
      return { results, failedTemplate: templateKey, error: error.message };
    }

    const r = (data ?? {}) as {
      inserted?: number;
      updated?: number;
      skipped?: number;
      blocked_published?: number;
    };

    results.push({
      templateKey,
      inserted: r.inserted ?? 0,
      updated: r.updated ?? 0,
      skipped: r.skipped ?? 0,
      blockedPublished: r.blocked_published ?? 0,
    });
  }

  const { error: finalizeError } = await asRpcClient(supabase).rpc(IMPORT_RPC.finalize, {
    _job_id: jobId,
    _succeeded: true,
    _error_message: null,
  });

  if (finalizeError) {
    return { results, failedTemplate: null, error: finalizeError.message };
  }

  return { results, failedTemplate: null, error: null };
}

/** Contract dependency order — a template never runs before what it references. */
export function orderTemplatesByDependency(
  templateKeys: readonly ContentImportTemplateKey[],
): ContentImportTemplateKey[] {
  const wanted = new Set(templateKeys);
  const ordered: ContentImportTemplateKey[] = [];
  const visiting = new Set<ContentImportTemplateKey>();

  const visit = (key: ContentImportTemplateKey): void => {
    if (ordered.includes(key) || !wanted.has(key)) return;
    if (visiting.has(key)) throw new Error(`IMPORT_TEMPLATE_CYCLE: ${key}`);
    visiting.add(key);
    for (const dep of IMPORT_ENTITY_CONTRACTS[key].dependsOn) visit(dep);
    visiting.delete(key);
    ordered.push(key);
  };

  for (const key of templateKeys) visit(key);
  return ordered;
}
