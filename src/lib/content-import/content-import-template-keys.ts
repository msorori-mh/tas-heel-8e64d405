/**
 * Canonical template keys for the lesson-content import package (01–10).
 *
 * Kept in its own module so the import contract and the template metadata can
 * both depend on it without creating an import cycle.
 */

export const CONTENT_IMPORT_TEMPLATE_KEYS = [
  "subjects",
  "units",
  "lessons",
  "book_contents",
  "explanations",
  "resources",
  "assessments",
  "assessment_questions",
  /** 09 — official textbook questions, with their original interaction types. */
  "questions",
  /** 10 — Tamkeen self-test; single-choice only. */
  "self_test_questions",
] as const;

export type ContentImportTemplateKey =
  (typeof CONTENT_IMPORT_TEMPLATE_KEYS)[number];
