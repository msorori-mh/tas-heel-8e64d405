/**
 * IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03 — execution state machine.
 *
 * Mirrors, in application code, the state machine enforced inside the database
 * by import_stage_rows / import_execute_template / import_finalize_job.
 *
 * Pure module — no DB access. Client and server safe.
 */

export const IMPORT_EXECUTION_IMPL_VERSION = "IMPORT-STAGING-EXECUTION-03" as const;

/** Migration file backing this module. Kept out of supabase/migrations until the apply gate. */
export const PHASE_03_MIGRATION_PATH =
  "supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql" as const;

/** Phase boundary: nothing in phase 03 may be applied to a database. */
export const PHASE_03_APPLY_STATUS = "not_applied" as const;

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
 * Template 09 does NOT share a transaction with the generic templates.
 * import_execute_template() raises QUESTION_BANK_WORKFLOW_REQUIRED for it, and
 * questions are written exclusively through the approved question-bank import
 * workflow (revision, validation, answer protection).
 *
 * No shared atomicity is claimed across that boundary: a question-bank import
 * and a content import are two separate units of work.
 */
export const QUESTION_BANK_BOUNDARY = {
  templateKey: "questions",
  rejectedBy: IMPORT_RPC.execute,
  errorCode: "QUESTION_BANK_WORKFLOW_REQUIRED",
  sharedTransactionWithContentTemplates: false,
  writePath: "question bank import/runtime workflow (QB-01/QB-02)",
} as const;

export function isQuestionBankRoutedTemplate(templateKey: string): boolean {
  return templateKey === QUESTION_BANK_BOUNDARY.templateKey;
}

export function assertGenericUpsertAllowed(templateKey: string): void {
  if (isQuestionBankRoutedTemplate(templateKey)) {
    throw new Error(QUESTION_BANK_BOUNDARY.errorCode);
  }
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
