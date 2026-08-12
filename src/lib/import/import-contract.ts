/**
 * IMPORT-CONTRACT-FINAL-01 — machine-readable import contract.
 *
 * Source of truth for: Excel field → DB table.column mapping, natural keys,
 * uniqueness scope, dependency graph, and idempotency/revision semantics.
 *
 * Verified against the live schema on 2026-08-12 (read-only audit):
 *  - subjects_code_uniq          UNIQUE (code) WHERE code IS NOT NULL
 *  - units_code_subject_uniq     UNIQUE (subject_id, code) WHERE code IS NOT NULL
 *  - lessons_subject_id_slug_key UNIQUE (subject_id, slug)
 *  - questions_code_uniq         UNIQUE (code) WHERE code IS NOT NULL
 *  - lesson_book_contents_lesson_id_key UNIQUE (lesson_id)
 *  - assessment_questions_unique UNIQUE (assessment_id, question_id)
 *  - grades_slug_key / curriculum_tracks_track_code_key
 *
 * Pure data — no DB access, no writes. Client and server safe.
 */

import { CONTENT_IMPORT_TEMPLATE_KEYS, type ContentImportTemplateKey } from "../content-import/content-import-templates.ts";

export const IMPORT_CONTRACT_VERSION = "IMPORT-CONTRACT-FINAL-01";

/** How the natural key uniqueness is guaranteed today. */
export type UniquenessEnforcement =
  | { kind: "db_unique"; constraint: string }
  | { kind: "not_enforced"; gap: string };

export interface ImportFieldMapping {
  /** Column header in the Excel template. */
  field: string;
  /** Target table (public schema). */
  table: string;
  /** Target column, or null when the field only resolves a foreign key. */
  column: string | null;
  required: boolean;
  /** Resolution note: FK lookup, transform, or direct write. */
  note?: string;
}

export interface ImportEntityContract {
  templateKey: ContentImportTemplateKey;
  table: string;
  /** Excel columns forming the natural key. */
  naturalKey: readonly string[];
  /** DB columns the natural key maps to. */
  naturalKeyColumns: readonly string[];
  /** Scope in which the natural key must be unique. */
  uniquenessScope: string;
  uniqueness: UniquenessEnforcement;
  /** Template keys that must be imported before this one. */
  dependsOn: readonly ContentImportTemplateKey[];
  /** Real FK edges in the DB backing those dependencies. */
  foreignKeys: readonly string[];
  fields: readonly ImportFieldMapping[];
  /** Rows of this entity are written through the question-bank workflow, not generic upsert. */
  questionBankWorkflow?: boolean;
  /** Known blockers that require an approved migration before execute. */
  gaps?: readonly string[];
}

const f = (
  field: string,
  table: string,
  column: string | null,
  required: boolean,
  note?: string,
): ImportFieldMapping => ({ field, table, column, required, ...(note ? { note } : {}) });

export const IMPORT_ENTITY_CONTRACTS: Record<ContentImportTemplateKey, ImportEntityContract> = {
  subjects: {
    templateKey: "subjects",
    table: "subjects",
    naturalKey: ["subject_code"],
    naturalKeyColumns: ["code"],
    uniquenessScope: "global (code IS NOT NULL)",
    uniqueness: { kind: "db_unique", constraint: "subjects_code_uniq" },
    dependsOn: [],
    foreignKeys: ["subjects.grade_id → grades.id", "subjects.curriculum_track_id → curriculum_tracks.id"],
    fields: [
      f("subject_code", "subjects", "code", true),
      f("name", "subjects", "name", true),
      f("grade_slug", "grades", null, true, "lookup grades.slug → subjects.grade_id"),
      f("track_code", "curriculum_tracks", null, false, "lookup curriculum_tracks.track_code → subjects.curriculum_track_id"),
      f("semester", "subjects", "semester", false),
      f("icon", "subjects", "icon", false),
      f("color", "subjects", "color", false),
      f("sort_order", "subjects", "sort_order", false),
      f("editor_notes", "subjects", null, false, "not persisted — operator note only"),
      f("review_status", "subjects", null, false, "no review column on subjects (see gaps)"),
    ],
    gaps: ["subjects has no review/publication status column; slug is required and NOT NULL but absent from template 01."],
  },
  units: {
    templateKey: "units",
    table: "units",
    naturalKey: ["subject_code", "unit_code"],
    naturalKeyColumns: ["subject_id", "code"],
    uniquenessScope: "per subject (code IS NOT NULL)",
    uniqueness: { kind: "db_unique", constraint: "units_code_subject_uniq" },
    dependsOn: ["subjects"],
    foreignKeys: ["units.subject_id → subjects.id"],
    fields: [
      f("unit_code", "units", "code", true),
      f("subject_code", "subjects", null, true, "lookup subjects.code → units.subject_id"),
      f("title", "units", "title", true),
      f("description", "units", "description", false),
      f("semester", "units", "semester", false),
      f("is_free", "units", "is_free", false),
      f("sort_order", "units", "sort_order", false),
      f("review_status", "units", null, false, "no review column on units (see gaps)"),
    ],
    gaps: ["units has no review/publication status column."],
  },
  lessons: {
    templateKey: "lessons",
    table: "lessons",
    naturalKey: ["subject_code", "lesson_code"],
    naturalKeyColumns: ["subject_id", "slug"],
    uniquenessScope: "per subject",
    uniqueness: { kind: "db_unique", constraint: "lessons_subject_id_slug_key" },
    dependsOn: ["subjects", "units"],
    foreignKeys: ["lessons.subject_id → subjects.id", "lessons.unit_id → units.id (nullable)"],
    fields: [
      f("lesson_code", "lessons", "slug", true, "lesson_code IS lessons.slug — there is no lessons.code column"),
      f("subject_code", "subjects", null, true, "lookup subjects.code → lessons.subject_id"),
      f("unit_code", "units", null, false, "lookup (subject_id, units.code) → lessons.unit_id; empty = lesson attached directly to subject"),
      f("title", "lessons", "title", true),
      f("duration", "lessons", "duration", false),
      f("semester", "lessons", "semester", false),
      f("is_free", "lessons", "is_free", false),
      f("sort_order", "lessons", "sort_order", false),
      f("review_status", "lessons", null, false, "no review column on lessons (see gaps)"),
    ],
    gaps: ["lessons has no review/publication status column; unit-less lessons are supported by schema (unit_id nullable) and MUST be covered by E2E."],
  },
  book_contents: {
    templateKey: "book_contents",
    table: "lesson_book_contents",
    naturalKey: ["lesson_code"],
    naturalKeyColumns: ["lesson_id"],
    uniquenessScope: "one row per lesson",
    uniqueness: { kind: "db_unique", constraint: "lesson_book_contents_lesson_id_key" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_book_contents.lesson_id → lessons.id"],
    fields: [
      f("lesson_code", "lessons", null, true, "lookup (subject_id, slug) → lesson_book_contents.lesson_id"),
      f("content", "lesson_book_contents", "content", true),
      f("pdf_url", "lesson_book_contents", "pdf_url", false),
      f("editor_notes", "lesson_book_contents", null, false, "not persisted"),
    ],
    gaps: ["lesson_code alone is ambiguous across subjects — the row must also carry subject_code or the job must be subject-scoped."],
  },
  explanations: {
    templateKey: "explanations",
    table: "lesson_explanations",
    naturalKey: ["lesson_code", "title", "sort_order"],
    naturalKeyColumns: ["lesson_id", "title", "sort_order"],
    uniquenessScope: "per lesson",
    uniqueness: { kind: "not_enforced", gap: "no unique index on lesson_explanations — re-import would duplicate rows" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_explanations.lesson_id → lessons.id"],
    fields: [
      f("lesson_code", "lessons", null, true, "FK lookup"),
      f("title", "lesson_explanations", "title", true),
      f("content", "lesson_explanations", "content", true),
      f("sort_order", "lesson_explanations", "sort_order", false),
      f("review_status", "lesson_explanations", null, false, "no review column"),
    ],
    gaps: ["Idempotency requires a unique key (lesson_id, sort_order) or a stored row_hash — migration required before execute."],
  },
  resources: {
    templateKey: "resources",
    table: "lesson_resources",
    naturalKey: ["lesson_code", "resource_type", "title"],
    naturalKeyColumns: ["lesson_id", "resource_type", "title"],
    uniquenessScope: "per lesson",
    uniqueness: { kind: "not_enforced", gap: "no unique index on lesson_resources" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_resources.lesson_id → lessons.id"],
    fields: [
      f("lesson_code", "lessons", null, true, "FK lookup"),
      f("resource_type", "lesson_resources", "resource_type", true, "enum lesson_resource_type: video|mindmap|experiment|pdf|link"),
      f("title", "lesson_resources", "title", true),
      f("description", "lesson_resources", "description", false),
      f("resource_url", "lesson_resources", "url", true, "lesson_resources.url is NOT NULL"),
      f("sort_order", "lesson_resources", "sort_order", false),
      f("resource_format", "lesson_resources", null, false, "not persisted"),
      f("local_asset_path", "lesson_resources", null, false, "not persisted — storage path resolved separately"),
      f("thumbnail_url", "lesson_resources", null, false, "no column (lesson_simulations only)"),
      f("is_interactive", "lesson_resources", null, false, "not persisted"),
      f("attribution", "lesson_resources", null, false, "not persisted"),
      f("license_note", "lesson_resources", null, false, "not persisted"),
      f("notes", "lesson_resources", null, false, "not persisted"),
    ],
    gaps: [
      "resource_url is optional in the template but lesson_resources.url is NOT NULL — must become required.",
      "7 template columns have no destination column; either drop them from the template or add a metadata jsonb column (migration).",
    ],
  },
  questions: {
    templateKey: "questions",
    table: "questions",
    naturalKey: ["question_code"],
    naturalKeyColumns: ["code"],
    uniquenessScope: "global (code IS NOT NULL)",
    uniqueness: { kind: "db_unique", constraint: "questions_code_uniq" },
    dependsOn: ["subjects", "lessons"],
    foreignKeys: ["questions.subject_id → subjects.id", "questions.lesson_id → lessons.id"],
    questionBankWorkflow: true,
    fields: [
      f("question_code", "questions", "code", true),
      f("question_text", "questions", "question_text", true),
      f("option_1", "questions", "options", true, "options jsonb array"),
      f("option_2", "questions", "options", true),
      f("option_3", "questions", "options", false),
      f("option_4", "questions", "options", false),
      f("option_5", "questions", "options", false),
      f("option_6", "questions", "options", false),
      f("correct_index", "questions", "correct_index", true, "1-based in Excel, 0-based in DB — transform required"),
      f("explanation", "questions", "explanation", false),
      f("subject_code", "subjects", null, false, "FK lookup"),
      f("lesson_code", "lessons", null, false, "FK lookup"),
      f("question_type", "questions", "question_type", false),
      f("year", "questions", "year", false),
      f("semester", "questions", "semester", false),
      f("sort_order", "questions", "sort_order", false),
    ],
    gaps: [
      "questions has no revision/publication columns — published answers cannot be safely overwritten today.",
      "Writes MUST route through the question-bank workflow (answer protection, review, publish gate), never a generic upsert.",
    ],
  },
  assessments: {
    templateKey: "assessments",
    table: "lesson_assessments",
    naturalKey: ["assessment_code"],
    naturalKeyColumns: [],
    uniquenessScope: "global",
    uniqueness: { kind: "not_enforced", gap: "lesson_assessments has no code column at all" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_assessments.lesson_id → lessons.id"],
    fields: [
      f("assessment_code", "lesson_assessments", null, true, "NO destination column — migration required"),
      f("lesson_code", "lessons", null, true, "FK lookup"),
      f("title", "lesson_assessments", "title", true),
      f("instructions", "lesson_assessments", "instructions", false),
      f("sort_order", "lesson_assessments", "sort_order", false),
      f("review_status", "lesson_assessments", null, false, "no review column"),
    ],
    gaps: ["Blocking: add lesson_assessments.code + UNIQUE(code) WHERE code IS NOT NULL, mirroring subjects/questions."],
  },
  assessment_questions: {
    templateKey: "assessment_questions",
    table: "assessment_questions",
    naturalKey: ["assessment_code", "question_code"],
    naturalKeyColumns: ["assessment_id", "question_id"],
    uniquenessScope: "per assessment",
    uniqueness: { kind: "db_unique", constraint: "assessment_questions_unique" },
    dependsOn: ["assessments", "questions"],
    foreignKeys: [
      "assessment_questions.assessment_id → lesson_assessments.id",
      "assessment_questions.question_id → questions.id",
    ],
    fields: [
      f("assessment_code", "lesson_assessments", null, true, "blocked until lesson_assessments.code exists"),
      f("question_code", "questions", null, true, "lookup questions.code → question_id"),
      f("sort_order", "assessment_questions", "sort_order", false),
      f("points", "assessment_questions", "points", false),
      f("editor_notes", "assessment_questions", null, false, "not persisted"),
    ],
    gaps: ["Depends on the lesson_assessments.code migration."],
  },
};

/** Dependency-correct execution order derived from IMPORT_ENTITY_CONTRACTS. */
export function resolveImportExecutionOrder(): ContentImportTemplateKey[] {
  const visited = new Set<ContentImportTemplateKey>();
  const order: ContentImportTemplateKey[] = [];
  const visiting = new Set<ContentImportTemplateKey>();

  const visit = (key: ContentImportTemplateKey) => {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Cyclic import dependency at ${key}`);
    visiting.add(key);
    for (const dep of IMPORT_ENTITY_CONTRACTS[key].dependsOn) visit(dep);
    visiting.delete(key);
    visited.add(key);
    order.push(key);
  };

  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) visit(key);
  return order;
}

export const IMPORT_EXECUTION_ORDER: readonly ContentImportTemplateKey[] =
  resolveImportExecutionOrder();

/* ------------------------------------------------------------------ */
/* Idempotency + revision semantics                                    */
/* ------------------------------------------------------------------ */

export type TargetPublicationState = "absent" | "draft" | "published" | "archived";

export type ImportRowAction =
  | "INSERT"
  | "SKIP"
  | "UPDATE_DRAFT"
  | "NEW_REVISION"
  | "BLOCKED_PUBLISHED";

export interface IdempotencyDecisionInput {
  /** Publication state of the existing row matched by natural key. */
  target: TargetPublicationState;
  /** Row hash stored for the existing row (null when unknown/never imported). */
  storedRowHash: string | null;
  /** Row hash computed from the incoming Excel row. */
  incomingRowHash: string;
  /** Entity supports revisioning (question bank). */
  supportsRevision: boolean;
}

/**
 * Contract rule:
 *   same natural_key + same row_hash                      → SKIP
 *   same natural_key + different hash + draft             → UPDATE_DRAFT
 *   same natural_key + different hash + published         → NEW_REVISION (if supported)
 *                                                          otherwise BLOCKED_PUBLISHED
 *   no natural_key match                                  → INSERT
 * A published row is never silently overwritten — especially answer data.
 */
export function resolveImportRowAction(input: IdempotencyDecisionInput): ImportRowAction {
  if (input.target === "absent") return "INSERT";
  if (input.storedRowHash !== null && input.storedRowHash === input.incomingRowHash) {
    return "SKIP";
  }
  if (input.target === "draft") return "UPDATE_DRAFT";
  // published or archived
  return input.supportsRevision ? "NEW_REVISION" : "BLOCKED_PUBLISHED";
}

/** Review and publication are two independent axes — never one merged column. */
export const REVIEW_STATES = ["pending", "approved", "rejected"] as const;
export const PUBLICATION_STATES = ["draft", "published", "archived"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** Entities whose contract currently blocks execute until an approved migration lands. */
export function listBlockingContractGaps(): Array<{ templateKey: ContentImportTemplateKey; gaps: readonly string[] }> {
  return CONTENT_IMPORT_TEMPLATE_KEYS.filter((k) => (IMPORT_ENTITY_CONTRACTS[k].gaps?.length ?? 0) > 0).map(
    (templateKey) => ({ templateKey, gaps: IMPORT_ENTITY_CONTRACTS[templateKey].gaps ?? [] }),
  );
}
