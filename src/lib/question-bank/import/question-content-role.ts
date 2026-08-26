import { issue, type QbImportIssue } from "./errors.ts";
import type { OfficialNormalizedV1 } from "./official-normalized-v1.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";

/**
 * Semantic lesson-question roles. These values are persisted in
 * question_revisions.educational_label and are the only supported classifier.
 * Interaction shape (for example, whether options exist) must never decide the
 * student section: an official book question may itself be multiple choice.
 */
export const QUESTION_CONTENT_ROLES = ["OFFICIAL_BOOK_QUESTION", "SELF_TEST"] as const;

export type QuestionContentRole = (typeof QUESTION_CONTENT_ROLES)[number];

export function parseQuestionContentRole(value: unknown): QuestionContentRole | null {
  return typeof value === "string" &&
    (QUESTION_CONTENT_ROLES as readonly string[]).includes(value.trim())
    ? (value.trim() as QuestionContentRole)
    : null;
}

export function assignQuestionContentRole(
  row: OfficialNormalizedV1,
  role: QuestionContentRole,
): OfficialNormalizedV1 {
  return {
    ...row,
    revision: { ...row.revision, educational_label: role },
  };
}

export function validateQuestionContentRole(
  row: OfficialNormalizedV1,
  ctx: {
    requireRole?: boolean;
    expectedRole?: QuestionContentRole;
    file?: string;
    sheet?: string;
    rowNumber?: number;
  } = {},
): QbImportIssue[] {
  const issues: QbImportIssue[] = [];
  const rawRole = row.revision.educational_label;
  const role = parseQuestionContentRole(rawRole);
  const base = {
    file: ctx.file ?? null,
    sheet: ctx.sheet ?? null,
    row: ctx.rowNumber ?? null,
    stage: "ROW_VALIDATION" as const,
    source_subsystem: "question-content-role",
  };

  if (!role) {
    if (ctx.requireRole || rawRole) {
      issues.push(
        issue(QB_IMPORT_CODES.INVALID_CONTRACT, {
          ...base,
          column: "content_role",
          suggested_fix: "استخدم OFFICIAL_BOOK_QUESTION أو SELF_TEST فقط.",
        }),
      );
    }
    return issues;
  }

  if (ctx.expectedRole && role !== ctx.expectedRole) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_CONTRACT, {
        ...base,
        column: "content_role",
        suggested_fix: `هذا القالب مخصص للدور ${ctx.expectedRole}.`,
      }),
    );
  }

  const answerText =
    role === "OFFICIAL_BOOK_QUESTION"
      ? row.answer_layer?.model_answer
      : row.answer_layer?.explanation;
  const hasRequiredAnswerLayer =
    (answerText ?? "").trim().length > 0 ||
    row.solutions.some((solution) => solution.body.trim().length > 0);
  if (!hasRequiredAnswerLayer) {
    issues.push(
      issue(QB_IMPORT_CODES.MISSING_VALUE, {
        ...base,
        column: role === "OFFICIAL_BOOK_QUESTION" ? "model_answer" : "explanation",
        suggested_fix:
          role === "OFFICIAL_BOOK_QUESTION"
            ? "أضف الإجابة النموذجية التي ستظهر بعد محاولة الطالب."
            : "أضف شرح الإجابة أو تصويبها الذي سيظهر بعد اختيار الطالب.",
      }),
    );
  }

  if (
    role === "SELF_TEST" &&
    (row.revision.interaction_type !== "SINGLE_CHOICE" ||
      row.revision.grading_mode !== "AUTO_SINGLE")
  ) {
    issues.push(
      issue(QB_IMPORT_CODES.INCOMPATIBLE_TYPE_MODE, {
        ...base,
        column: "interaction_type",
        suggested_fix: "أسئلة «اختبر فهمك» يجب أن تكون SINGLE_CHOICE مع AUTO_SINGLE.",
      }),
    );
  }

  return issues;
}

/**
 * Returns rows for one explicit role only. Deliberately does not inspect
 * options, grading mode, or question wording to infer a role.
 */
export function questionsForRole(
  rows: readonly OfficialNormalizedV1[],
  role: QuestionContentRole,
): OfficialNormalizedV1[] {
  return rows.filter((row) => parseQuestionContentRole(row.revision.educational_label) === role);
}
