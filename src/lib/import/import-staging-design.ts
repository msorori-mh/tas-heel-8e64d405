/**
 * IMPORT_EXECUTION_READINESS_GAP_CLOSURE_02 — staging + execute design (DESIGN ONLY).
 *
 * Nothing here touches the database. This module is the machine-readable design of
 * the staging tables, the execution state machine, and the atomicity/authorization
 * rules that a later approved migration must implement verbatim.
 *
 * Pure data — client and server safe.
 */

import type { ContentImportTemplateKey } from "../content-import/content-import-templates.ts";
import type { ImportRowAction } from "./import-contract.ts";

export const IMPORT_EXECUTION_DESIGN_VERSION = "IMPORT-EXECUTION-READINESS-02" as const;

/** Design status of everything in this module. No DDL has been applied. */
export const EXECUTION_DESIGN_STATUS = "design_closed_not_applied" as const;

/* ------------------------------------------------------------------ */
/* Staging tables                                                      */
/* ------------------------------------------------------------------ */

export interface StagingColumnDesign {
  name: string;
  type: string;
  notNull: boolean;
  note?: string;
}

export interface StagingTableDesign {
  table: string;
  purpose: string;
  columns: readonly StagingColumnDesign[];
  indexes: readonly string[];
  /** RLS intent — content staff only; students must never reach staging. */
  access: string;
}

const c = (name: string, type: string, notNull: boolean, note?: string): StagingColumnDesign => ({
  name,
  type,
  notNull,
  ...(note ? { note } : {}),
});

export const STAGING_TABLES: readonly StagingTableDesign[] = [
  {
    table: "import_staging_rows",
    purpose:
      "One row per parsed Excel row for a given import job. Written by dry-run, read by execute. Never referenced by student-facing queries.",
    columns: [
      c("id", "uuid pk", true),
      c("job_id", "uuid → import_jobs.id on delete cascade", true),
      c("template_key", "text", true, "one of the 9 content templates"),
      c("sheet_name", "text", false),
      c("row_number", "integer", true, "1-based Excel row, for operator-facing errors"),
      c("natural_key", "text", true, "canonical joined natural key for this entity"),
      c("row_hash", "text", true, "canonical hash over ROW_HASH_FIELDS after normalization"),
      c("payload", "jsonb", true, "normalized field values only — never the raw file"),
      c(
        "resolved_refs",
        "jsonb",
        true,
        "FK ids resolved during dry-run (subject_id, lesson_id, …)",
      ),
      c(
        "planned_action",
        "text",
        true,
        "INSERT | UPDATE_DRAFT | NEW_REVISION | SKIP | BLOCKED_PUBLISHED",
      ),
      c("target_id", "uuid", false, "existing row matched by the natural key, when any"),
      c("is_valid", "boolean", true),
      c("created_at", "timestamptz", true),
    ],
    indexes: [
      "UNIQUE (job_id, template_key, natural_key) — a job may not carry the same entity twice",
      "INDEX (job_id, template_key, row_number)",
    ],
    access: "content staff only (is_content_staff); service_role for execute. No anon, no student.",
  },
  {
    table: "content_review_state",
    purpose:
      "GAP-03. Single side table holding review + publication state for every importable content entity, bound to the content hash.",
    columns: [
      c("id", "uuid pk", true),
      c(
        "entity_type",
        "text",
        true,
        "subjects | units | lessons | lesson_explanations | lesson_assessments | questions",
      ),
      c("entity_id", "uuid", true),
      c("review_status", "text", true, "pending | approved | rejected — default pending"),
      c("publication_status", "text", true, "draft | published | archived — default draft"),
      c("content_hash", "text", true, "hash the current approval refers to"),
      c("reviewed_by", "uuid", false),
      c("reviewed_at", "timestamptz", false),
      c("created_at", "timestamptz", true),
      c("updated_at", "timestamptz", true),
    ],
    indexes: ["UNIQUE (entity_type, entity_id)", "INDEX (entity_type, publication_status)"],
    access:
      "content staff read; approval/publish writes restricted to full admins. Students never read this table — publication is projected through existing security-definer RPCs.",
  },
] as const;

/**
 * GAP-03 invariant: approval is bound to the exact content it was granted for.
 * Any write that changes content_hash MUST reset review_status to 'pending' and
 * publication_status to 'draft'. Implemented as a BEFORE UPDATE trigger, not app code.
 */
export const REVIEW_STATE_HASH_BINDING_RULE =
  "content_hash changed → review_status='pending', publication_status='draft', reviewed_by=NULL, reviewed_at=NULL" as const;

/* ------------------------------------------------------------------ */
/* Execution state machine                                             */
/* ------------------------------------------------------------------ */

export const EXECUTION_STATES = [
  "uploaded",
  "validating",
  "validated",
  "applying",
  "applied",
  "failed",
  "cancelled",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export const EXECUTION_TRANSITIONS: Record<ExecutionState, readonly ExecutionState[]> = {
  uploaded: ["validating", "cancelled"],
  validating: ["validated", "failed", "cancelled"],
  validated: ["applying", "cancelled"],
  applying: ["applied", "failed"],
  applied: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: ExecutionState, to: ExecutionState): boolean {
  return EXECUTION_TRANSITIONS[from].includes(to);
}

/** Terminal states — a job in one of these can never be resumed, only superseded by a new job. */
export const TERMINAL_EXECUTION_STATES = ["applied", "failed", "cancelled"] as const;

/* ------------------------------------------------------------------ */
/* Atomicity + authorization rules for execute                         */
/* ------------------------------------------------------------------ */

export const EXECUTION_RULES = {
  /** One template's rows apply inside one transaction; a single failing row rolls the whole template back. */
  atomicity: "per_template_transaction",
  /** Templates apply in the contract dependency order; a failed template aborts the remaining ones. */
  ordering: "contract_dependency_order",
  /** Re-running a job is a no-op: rows already applied match on (job_id, natural_key, row_hash). */
  idempotencyKey: "(job_id, template_key, natural_key, row_hash)",
  /** Execute runs in a SECURITY DEFINER RPC that re-checks the caller's role server-side. */
  authorization: "is_content_staff for apply; is_full_admin for publish",
  /** Dry-run results are not trusted at execute time — validation is recomputed inside the transaction. */
  revalidation: "mandatory_inside_transaction",
  /** Published rows are never overwritten by import, under any action. */
  publishedOverwrite: "forbidden",
} as const;

/** Actions execute is allowed to perform. BLOCKED_PUBLISHED is reported, never applied. */
export const EXECUTABLE_ACTIONS: readonly ImportRowAction[] = [
  "INSERT",
  "UPDATE_DRAFT",
  "NEW_REVISION",
  "SKIP",
];

export function isExecutableAction(action: ImportRowAction): boolean {
  return EXECUTABLE_ACTIONS.includes(action);
}

/** Templates whose writes bypass generic upsert and must go through the question-bank workflow. */
export const QUESTION_BANK_ROUTED_TEMPLATES: readonly ContentImportTemplateKey[] = [
  "questions",
  "self_test_questions",
];
