/**
 * IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03 — execution state machine.
 *
 * Mirrors, in application code, the state machine enforced inside the database
 * by import_stage_rows / import_execute_template / import_finalize_job.
 *
 * Pure module — no DB access. Client and server safe.
 */

export const IMPORT_EXECUTION_IMPL_VERSION = "IMPORT-STAGING-EXECUTION-03" as const;

/**
 * Historical source artifact backing this module. The path remains pending-only
 * to preserve the applied bytes; it is not an instruction to re-apply it.
 */
export const PHASE_03_MIGRATION_PATH =
  "supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql" as const;

/**
 * Measured shared Lovable datastore state. Evidence is retained in the
 * production readiness review; source placement and runtime state are separate.
 */
export const PHASE_03_APPLY_STATUS = "applied_shared_lovable_db" as const;
export const PHASE_03_APPLY_EVIDENCE =
  "docs/import/PRODUCTION-CONTENT-IMPORT-READINESS-REVIEW-10.md" as const;

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export const JOB_EXECUTION_STATES = [
  "validated",
  "planned",
  "applying",
  "applied",
  "failed",
] as const;

export type JobExecutionState = (typeof JOB_EXECUTION_STATES)[number];

export const JOB_EXECUTION_TRANSITIONS: Record<JobExecutionState, readonly JobExecutionState[]> = {
  validated: ["planned"],
  planned: ["planned", "applying", "applied", "failed"],
  applying: ["planned", "applied", "failed"],
  applied: [],
  failed: [],
};

export const TERMINAL_JOB_EXECUTION_STATES = ["applied", "failed"] as const;

export function canTransitionJob(from: JobExecutionState, to: JobExecutionState): boolean {
  return JOB_EXECUTION_TRANSITIONS[from].includes(to);
}

export function isTerminalJobState(state: JobExecutionState): boolean {
  return (TERMINAL_JOB_EXECUTION_STATES as readonly string[]).includes(state);
}

export function assertJobTransition(from: JobExecutionState, to: JobExecutionState): void {
  if (!canTransitionJob(from, to)) {
    throw new Error(`INVALID_STATE_TRANSITION: ${from} → ${to}`);
  }
}

/* ------------------------------------------------------------------ */
/* Database entry points                                               */
/* ------------------------------------------------------------------ */

/**
 * Every mutation of staging / review state / domain content goes through one of
 * these RPCs. There is no direct table write path from the application.
 */
export const IMPORT_RPC = {
  stage: "import_stage_rows",
  execute: "import_execute_template",
  finalize: "import_finalize_job",
  reviewSetState: "content_review_set_state",
} as const;

/** Tables the application may only ever SELECT from. */
export const RPC_ONLY_TABLES = ["import_staging_rows", "content_review_state"] as const;

/* ------------------------------------------------------------------ */
/* Question bank boundary (template 09)                                */
/* ------------------------------------------------------------------ */

/**
 * QUESTION_IMPORT_QB_BINDING_08.
 *
 * Template 09 is executable, but NEVER through the generic upsert path:
 * import_execute_template() delegates it to import_execute_questions_template(),
 * which calls the internal qb_import_ingest_revision() once per staged row
 * inside one transaction. That function is not callable by anon/authenticated.
 *
 * The import path stops at DRAFT revisions — it never approves and never
 * publishes, and it never writes the legacy answer columns of public.questions.
 */
export const QUESTION_BANK_BOUNDARY = {
  templateKey: "questions",
  rejectedBy: IMPORT_RPC.execute,
  errorCode: "QUESTION_BANK_WORKFLOW_REQUIRED",
  sharedTransactionWithContentTemplates: false,
  writePath: "question bank import workflow (qb_import_ingest_revision → DRAFT revision)",
} as const;

export const QUESTION_BANK_IMPORT_BINDING = {
  templateKey: "questions",
  executeRpc: "import_execute_questions_template",
  internalFunction: "qb_import_ingest_revision",
  clientCallable: false,
  publishesFromImport: false,
  contentIdentity: "question_revisions.source_payload_hash (targets excluded)",
  targetIdentity: "question_targets (question_id, target_type, target ref)",
  concurrencyLock: "pg_advisory_xact_lock(hashtextextended('qb_question_code:'||code, 0))",
} as const;

/** Row actions the question-bank import path may record on a staged row. */
export const QB_IMPORT_ROW_ACTIONS = [
  "INSERT",
  "NEW_REVISION",
  "PUBLISHED_PRESERVED_NEW_REVISION",
  "TARGET_ADDED",
  "SKIP",
] as const;

export type QbImportRowAction = (typeof QB_IMPORT_ROW_ACTIONS)[number];

export function isQuestionBankRoutedTemplate(templateKey: string): boolean {
  return templateKey === QUESTION_BANK_BOUNDARY.templateKey;
}

/**
 * Guard for the GENERIC upsert path only. Questions must never reach it.
 * Execution eligibility is a different question — see assertTemplateExecutable().
 */
export function assertGenericUpsertAllowed(templateKey: string): void {
  if (isQuestionBankRoutedTemplate(templateKey)) {
    throw new Error(QUESTION_BANK_BOUNDARY.errorCode);
  }
}

/**
 * Execution gate used by the prepare/execute wiring: every contract template is
 * executable, questions through the question-bank binding, everything else
 * through the generic upsert path.
 */
export function assertTemplateExecutable(_templateKey: string): void {
  // All contract templates are executable; routing happens inside the database.
}


/* ------------------------------------------------------------------ */
/* Phase separation                                                    */
/* ------------------------------------------------------------------ */

/**
 * validate  → zero persistence (dry-run)
 * prepare   → import_jobs + import_staging_rows only, zero domain writes
 * execute   → domain writes, inside one DB transaction per template
 */
export const IMPORT_PHASE_WRITE_SCOPE = {
  validate: "none",
  prepare: "jobs_and_staging_only",
  execute: "domain_writes",
} as const;

export type ImportPhase = keyof typeof IMPORT_PHASE_WRITE_SCOPE;
