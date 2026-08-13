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

import {
  CONTENT_IMPORT_TEMPLATE_KEYS,
  type ContentImportTemplateKey,
} from "../content-import/content-import-template-keys.ts";

export const IMPORT_CONTRACT_VERSION = "IMPORT-CONTRACT-FINAL-01";

/** Stable identifiers for the 7 execution-readiness blockers (phase 02). */
export type ImportGapId =
  | "GAP-01-ASSESSMENT-CODE"
  | "GAP-02-STABLE-CHILD-IDENTITY"
  | "GAP-03-REVIEW-STATE"
  | "GAP-04-RESOURCE-URL-REQUIRED"
  | "GAP-05-RESOURCE-METADATA"
  | "GAP-06-SUBJECT-SCOPE"
  | "GAP-07-SUBJECT-SLUG";

/** How the natural key uniqueness is guaranteed today. */

export type UniquenessEnforcement =
  | { kind: "db_unique"; constraint: string }
  /** Design-closed: exact constraint decided and drafted, not yet applied to the DB. */
  | { kind: "planned_unique"; constraint: string; scope: string; draftRef: string }
  | { kind: "not_enforced"; gap: string };


export interface ImportFieldMapping {
  /** Column header in the Excel template. */
  field: string;
  /**
   * Whether this field is an actual Excel column of the official template.
   * Defaults to true. Set to false for internal/derived values that must never
   * appear in the operator-facing workbook.
   */
  templateField?: boolean;
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
  /** Gap IDs (see IMPORT_GAP_RESOLUTIONS) whose design decision covers this entity. */
  gapIds?: readonly ImportGapId[];
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
      f("group_code", "subjects", "group_code", false, "SUBJECT_AS_BRANCH: كود المجموعة (عرض فقط) — immutable بعد التعيين"),
      f("group_name", "subjects", "group_name", false, "اسم المجموعة المعروض — يجب أن يتطابق داخل نفس group_code/grade/track"),
      f("grade_slug", "grades", null, true, "lookup grades.slug → subjects.grade_id"),
      f("track_code", "curriculum_tracks", null, false, "lookup curriculum_tracks.track_code → subjects.curriculum_track_id"),
      f("semester", "subjects", "semester", false),
      f("icon", "subjects", "icon", false),
      f("color", "subjects", "color", false),
      f("sort_order", "subjects", "sort_order", false),
      f("editor_notes", "subjects", null, false, "not persisted — operator note only"),
      f("review_status", "subjects", null, false, "GAP-03: routed to content_review_state, not a subjects column"),
    ],
    gaps: [
      "subjects has no review/publication status column → GAP-03 (content_review_state).",
      "subjects.slug is NOT NULL and absent from template 01 → GAP-07 (deriveSubjectSlug).",
    ],
    gapIds: ["GAP-03-REVIEW-STATE", "GAP-07-SUBJECT-SLUG"],
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
      f("review_status", "units", null, false, "GAP-03: routed to content_review_state"),
    ],
    gaps: ["units has no review/publication status column → GAP-03 (content_review_state)."],
    gapIds: ["GAP-03-REVIEW-STATE"],
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
      f("review_status", "lessons", null, false, "GAP-03: routed to content_review_state"),
    ],
    gaps: [
      "lessons has no review/publication status column → GAP-03 (content_review_state).",
      "unit-less lessons are supported by schema (unit_id nullable) and MUST be covered by E2E.",
    ],
    gapIds: ["GAP-03-REVIEW-STATE"],
  },
  book_contents: {
    templateKey: "book_contents",
    table: "lesson_book_contents",
    naturalKey: ["subject_code", "lesson_code"],
    naturalKeyColumns: ["lesson_id"],
    uniquenessScope: "one row per lesson (lesson resolved within subject_code)",
    uniqueness: { kind: "db_unique", constraint: "lesson_book_contents_lesson_id_key" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_book_contents.lesson_id → lessons.id"],
    fields: [
      f("subject_code", "subjects", null, true, "GAP-06: scopes lesson_code resolution to one subject"),
      f("lesson_code", "lessons", null, true, "lookup (subject_id, slug) → lesson_book_contents.lesson_id"),
      f("content", "lesson_book_contents", "content", true),
      f("pdf_url", "lesson_book_contents", "pdf_url", false),
      f("editor_notes", "lesson_book_contents", null, false, "not persisted"),
    ],
    gaps: [],
    gapIds: ["GAP-06-SUBJECT-SCOPE"],
  },
  explanations: {
    templateKey: "explanations",
    table: "lesson_explanations",
    naturalKey: ["subject_code", "lesson_code", "explanation_code"],
    naturalKeyColumns: ["lesson_id", "explanation_code"],
    uniquenessScope: "per lesson (explanation_code IS NOT NULL)",
    uniqueness: { kind: "db_unique", constraint: "lesson_explanations_code_lesson_uniq" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_explanations.lesson_id → lessons.id"],
    fields: [
      f("subject_code", "subjects", null, true, "GAP-06: scopes lesson_code resolution"),
      f("lesson_code", "lessons", null, true, "FK lookup"),
      f("explanation_code", "lesson_explanations", "explanation_code", true, "GAP-02: stable import identity — never sort_order"),
      f("title", "lesson_explanations", "title", true),
      f("content", "lesson_explanations", "content", true),
      f("sort_order", "lesson_explanations", "sort_order", false, "mutable presentation attribute — NOT part of the identity"),
      f("review_status", "lesson_explanations", null, false, "GAP-03: routed to content_review_state"),
    ],
    gaps: [
      "No review/publication column → GAP-03 (content_review_state).",
    ],

    gapIds: ["GAP-02-STABLE-CHILD-IDENTITY", "GAP-03-REVIEW-STATE", "GAP-06-SUBJECT-SCOPE"],
  },
  resources: {
    templateKey: "resources",
    table: "lesson_resources",
    naturalKey: ["subject_code", "lesson_code", "resource_code"],
    naturalKeyColumns: ["lesson_id", "resource_code"],
    uniquenessScope: "per lesson (resource_code IS NOT NULL)",
    uniqueness: { kind: "db_unique", constraint: "idx_lesson_resources_code_per_lesson" },

    dependsOn: ["lessons"],
    foreignKeys: ["lesson_resources.lesson_id → lessons.id"],
    fields: [
      f("subject_code", "subjects", null, true, "GAP-06: scopes lesson_code resolution"),
      f("lesson_code", "lessons", null, true, "FK lookup"),
      f("resource_code", "lesson_resources", "resource_code", true, "GAP-02: stable import identity — never sort_order"),
      f("resource_type", "lesson_resources", "resource_type", true, "enum lesson_resource_type: video|mindmap|experiment|pdf|link"),
      f("title", "lesson_resources", "title", true),
      f("description", "lesson_resources", "description", false),
      f("resource_url", "lesson_resources", "url", true, "GAP-04: required — lesson_resources.url is NOT NULL"),
      f("sort_order", "lesson_resources", "sort_order", false, "mutable presentation attribute — NOT part of the identity"),
      f("resource_format", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
      f("local_asset_path", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
      f("thumbnail_url", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
      f("is_interactive", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
      f("attribution", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
      f("license_note", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
      f("notes", "lesson_resources", "metadata", false, "GAP-05: metadata jsonb allowlist"),
    ],
    gaps: [],
    gapIds: [
      "GAP-02-STABLE-CHILD-IDENTITY",
      "GAP-04-RESOURCE-URL-REQUIRED",
      "GAP-05-RESOURCE-METADATA",
      "GAP-06-SUBJECT-SCOPE",
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
      f("review_status", "questions", null, false, "GAP-03: routed to content_review_state"),
    ],
    gaps: [
      "questions has no revision/publication columns → GAP-03 (content_review_state, hash-bound).",
      "Writes MUST route through the question-bank workflow (answer protection, review, publish gate), never a generic upsert.",
    ],
    gapIds: ["GAP-03-REVIEW-STATE"],
  },
  assessments: {
    templateKey: "assessments",
    table: "lesson_assessments",
    naturalKey: ["assessment_code"],
    naturalKeyColumns: ["assessment_code"],
    /**
     * Scope decided from the audited template contract, not from a new assumption:
     * template 08 references an assessment by `assessment_code` ALONE (no lesson_code
     * column), so the code must resolve globally. This mirrors subjects_code_uniq and
     * questions_code_uniq — the only two audited code columns with global scope.
     */
    uniquenessScope: "global (assessment_code IS NOT NULL) — required by template 08's lesson-less reference",
    uniqueness: { kind: "db_unique", constraint: "lesson_assessments_code_uniq" },
    dependsOn: ["lessons"],
    foreignKeys: ["lesson_assessments.lesson_id → lessons.id"],
    fields: [
      f("assessment_code", "lesson_assessments", "assessment_code", true, "GAP-01: new column, global partial unique"),

      f("subject_code", "subjects", null, true, "GAP-06: scopes lesson_code resolution"),
      f("lesson_code", "lessons", null, true, "FK lookup"),
      f("title", "lesson_assessments", "title", true),
      f("instructions", "lesson_assessments", "instructions", false),
      f("sort_order", "lesson_assessments", "sort_order", false),
      f("review_status", "lesson_assessments", null, false, "GAP-03: routed to content_review_state"),
    ],
    gaps: [
      "No review/publication column → GAP-03 (content_review_state).",
    ],
    gapIds: ["GAP-01-ASSESSMENT-CODE", "GAP-03-REVIEW-STATE", "GAP-06-SUBJECT-SCOPE"],
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
      f("assessment_code", "lesson_assessments", null, true, "resolves via the GAP-01 lesson_assessments.assessment_code column"),
      f("question_code", "questions", null, true, "lookup questions.code → question_id"),
      f("sort_order", "assessment_questions", "sort_order", false),
      f("points", "assessment_questions", "points", false),
      f("editor_notes", "assessment_questions", null, false, "not persisted"),
    ],
    gaps: [],
    gapIds: ["GAP-01-ASSESSMENT-CODE"],
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

/* ------------------------------------------------------------------ */
/* Phase 02 — execution-readiness gap resolutions (design only)        */
/* ------------------------------------------------------------------ */

export type GapResolutionKind =
  /** Template/column contract change only — no DDL. */
  | "template_change"
  /** Requires DDL, drafted but NOT applied. */
  | "schema_change"
  /** Pure deterministic derivation in application code. */
  | "derivation";

export interface ImportGapResolution {
  gapId: ImportGapId;
  /** Short English title of the original blocker. */
  blocker: string;
  kind: GapResolutionKind;
  /** The binding decision. */
  decision: string;
  /** Entities the decision covers. */
  entities: readonly ContentImportTemplateKey[];
  /**
   * "closed_design" = decided but not applied to the database.
   * "applied"       = the decision is live on the shared database (verified).
   */
  status: "closed_design" | "applied";
  /** Review-only SQL draft, never inside supabase/migrations. Absent once applied. */
  migrationDraftRef?: string;
  /** DB objects that prove an applied resolution (constraints, columns, tables). */
  appliedObjects?: readonly string[];
}

export const MIGRATION_DRAFT_REF =
  "docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql" as const;

export const IMPORT_GAP_RESOLUTIONS: Record<ImportGapId, ImportGapResolution> = {
  "GAP-01-ASSESSMENT-CODE": {
    gapId: "GAP-01-ASSESSMENT-CODE",
    blocker: "lesson_assessments has no assessment_code column",
    kind: "schema_change",
    decision:
      "Add lesson_assessments.assessment_code text with UNIQUE (assessment_code) WHERE assessment_code IS NOT NULL. Scope is GLOBAL, not (lesson_id, assessment_code), because template 08 references an assessment by assessment_code alone — matching the audited global scope of subjects_code_uniq and questions_code_uniq.",

    entities: ["assessments", "assessment_questions"],
    status: "applied",
    appliedObjects: ["lesson_assessments.assessment_code", "lesson_assessments_code_uniq"],
  },
  "GAP-02-STABLE-CHILD-IDENTITY": {
    gapId: "GAP-02-STABLE-CHILD-IDENTITY",
    blocker: "no unique key on lesson_explanations / lesson_resources",
    kind: "schema_change",
    decision:
      "Add lesson_explanations.explanation_code with UNIQUE (lesson_id, explanation_code) WHERE explanation_code IS NOT NULL, and reuse the existing lesson_resources.resource_code identity with UNIQUE (lesson_id, resource_code) WHERE resource_code IS NOT NULL. There is no `code` column on either table and none may be created. sort_order is a mutable presentation attribute and MUST NEVER take part in identity: reordering rows must not be read as edits to different entities.",

    entities: ["explanations", "resources"],
    status: "applied",
    appliedObjects: ["lesson_explanations.explanation_code", "lesson_explanations_code_lesson_uniq", "lesson_resources.resource_code", "idx_lesson_resources_code_per_lesson"],
  },
  "GAP-03-REVIEW-STATE": {
    gapId: "GAP-03-REVIEW-STATE",
    blocker: "no review/publication columns on content tables",
    kind: "schema_change",
    decision:
      "Single side table content_review_state keyed by (entity_type, entity_id) and BOUND TO content_hash. Any change of content_hash resets the row to review_status='pending' + publication_status='draft'; approval never survives a payload change.",
    entities: ["subjects", "units", "lessons", "explanations", "assessments", "questions"],
    status: "applied",
    appliedObjects: ["public.content_review_state"],
  },
  "GAP-04-RESOURCE-URL-REQUIRED": {
    gapId: "GAP-04-RESOURCE-URL-REQUIRED",
    blocker: "resource_url optional in template 06 while lesson_resources.url is NOT NULL",
    kind: "template_change",
    decision:
      "resource_url becomes a required template column; a missing value is rejected at validation time with MISSING_RESOURCE_URL. No DDL.",
    entities: ["resources"],
    status: "closed_design",
  },
  "GAP-05-RESOURCE-METADATA": {
    gapId: "GAP-05-RESOURCE-METADATA",
    blocker: "7 template-06 columns have no destination",
    kind: "schema_change",
    decision:
      "Add lesson_resources.metadata jsonb NOT NULL DEFAULT '{}'. Only the closed allowlist RESOURCE_METADATA_ALLOWLIST may be written; any other key is rejected. metadata is never a free-form store.",
    entities: ["resources"],
    status: "applied",
    appliedObjects: ["lesson_resources.metadata"],
  },
  "GAP-06-SUBJECT-SCOPE": {
    gapId: "GAP-06-SUBJECT-SCOPE",
    blocker: "lesson_code alone is ambiguous across subjects in templates 04–07",
    kind: "template_change",
    decision:
      "subject_code becomes a required column in templates 04, 05, 06 and 07; (subject_code, lesson_code) resolves exactly one lesson via lessons_subject_id_slug_key. A lesson_code that matches in more than one subject is rejected with AMBIGUOUS_LESSON_CODE.",
    entities: ["book_contents", "explanations", "resources", "assessments"],
    status: "closed_design",
  },
  "GAP-07-SUBJECT-SLUG": {
    gapId: "GAP-07-SUBJECT-SLUG",
    blocker: "subjects.slug is NOT NULL but absent from template 01",
    kind: "derivation",
    decision:
      "slug = deriveSubjectSlug(subject_code): deterministic derivation over one canonical input normalization. Slug-safe codes map to themselves; every other code maps to normalized + '--' + the first 128 bits (32 hex chars) of SHA-256 over the canonical raw code. The reserved '--' separator keeps the two branches disjoint. No collision-impossibility is claimed: planSubjectSlugs() performs explicit collision detection (in-batch and against existing rows) and fails closed with SLUG_COLLISION, and UNIQUE (subjects.slug) / subjects_slug_key is the final database guard.",
    entities: ["subjects"],
    status: "closed_design",
  },
};

export const IMPORT_GAP_IDS = Object.keys(IMPORT_GAP_RESOLUTIONS) as ImportGapId[];

/** Gaps still lacking a design decision. Phase 02 exit gate requires this to be empty. */
export function listOpenGaps(): ImportGapId[] {
  return IMPORT_GAP_IDS.filter(
    (id) =>
      IMPORT_GAP_RESOLUTIONS[id].status !== "closed_design" &&
      IMPORT_GAP_RESOLUTIONS[id].status !== "applied",
  );
}

/** Gap decisions that are live on the shared database. */
export function listAppliedGaps(): ImportGapId[] {
  return IMPORT_GAP_IDS.filter((id) => IMPORT_GAP_RESOLUTIONS[id].status === "applied");
}

/* ------------------------------------------------------------------ */
/* Single source of truth for Excel template columns                   */
/* ------------------------------------------------------------------ */

/** True when the field is an operator-facing Excel column (default). */
export function isTemplateField(field: ImportFieldMapping): boolean {
  return field.templateField !== false;
}

/** All Excel columns of a template, in contract order. */
export function templateColumnsForEntity(
  key: ContentImportTemplateKey,
): readonly string[] {
  return IMPORT_ENTITY_CONTRACTS[key].fields.filter(isTemplateField).map((f) => f.field);
}

/** Excel columns that must be present and non-empty for every row. */
export function requiredTemplateColumnsForEntity(
  key: ContentImportTemplateKey,
): readonly string[] {
  return IMPORT_ENTITY_CONTRACTS[key].fields
    .filter((f) => isTemplateField(f) && f.required)
    .map((f) => f.field);
}

/* ------------------------------------------------------------------ */
/* GAP-05 — closed metadata allowlist for template 06                  */
/* ------------------------------------------------------------------ */

export const RESOURCE_METADATA_ALLOWLIST = [
  "resource_format",
  "local_asset_path",
  "thumbnail_url",
  "is_interactive",
  "attribution",
  "license_note",
  "notes",
] as const;

export type ResourceMetadataKey = (typeof RESOURCE_METADATA_ALLOWLIST)[number];

export function isAllowedResourceMetadataKey(key: string): key is ResourceMetadataKey {
  return (RESOURCE_METADATA_ALLOWLIST as readonly string[]).includes(key);
}

/* ------------------------------------------------------------------ */
/* GAP-07 — subject slug derivation (see ./subject-slug.ts)            */
/* ------------------------------------------------------------------ */

export {
  SUBJECT_SLUG_CONTRACT_VERSION,
  SUBJECT_SLUG_DIGEST_HEX_LENGTH,
  SUBJECT_SLUG_SEPARATOR,
  SUBJECT_SLUG_UNIQUE_CONSTRAINT,
  SlugCollisionError,
  canonicalSubjectCodeInput,
  deriveSubjectSlug,
  isSlugSafeSubjectCode,
  planSubjectSlugs,
  sha256HexBytes,
  subjectCodeDigest,
  subjectCodeDigestAsync,
  subjectCodeDigestBytes,
} from "./subject-slug.ts";


/* ------------------------------------------------------------------ */
/* Canonical row hash inputs (idempotency + review binding)            */
/* ------------------------------------------------------------------ */

/**
 * Template columns that take part in the canonical row hash, per entity.
 * Operator-only columns (editor_notes) and workflow columns (review_status) are
 * excluded on purpose: they must not make a row look changed.
 * The hash is computed over these fields in this exact order after normalization
 * (trim, whitespace collapse, Arabic-Indic digit folding) — never over raw JSON.
 */
export const ROW_HASH_FIELDS: Record<ContentImportTemplateKey, readonly string[]> = {
  subjects: ["subject_code", "name", "grade_slug", "track_code", "semester", "icon", "color", "sort_order"],
  units: ["subject_code", "unit_code", "title", "description", "semester", "is_free", "sort_order"],
  lessons: ["subject_code", "lesson_code", "unit_code", "title", "duration", "semester", "is_free", "sort_order"],
  book_contents: ["subject_code", "lesson_code", "content", "pdf_url"],
  explanations: ["subject_code", "lesson_code", "explanation_code", "title", "content", "sort_order"],
  resources: [
    "subject_code",
    "lesson_code",
    "resource_code",
    "resource_type",
    "title",
    "description",
    "resource_url",
    "sort_order",
    ...RESOURCE_METADATA_ALLOWLIST,
  ],
  assessments: ["assessment_code", "subject_code", "lesson_code", "title", "instructions", "sort_order"],
  assessment_questions: ["assessment_code", "question_code", "sort_order", "points"],
  questions: [
    "question_code",
    "subject_code",
    "lesson_code",
    "question_text",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "option_5",
    "option_6",
    "correct_index",
    "explanation",
    "question_type",
    "year",
    "semester",
    "sort_order",
  ],
};

/** Columns that must never influence the row hash. */
export const ROW_HASH_EXCLUDED_FIELDS = ["editor_notes", "review_status"] as const;
