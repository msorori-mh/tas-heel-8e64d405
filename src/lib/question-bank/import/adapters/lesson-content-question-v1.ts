import { adaptOfficialFlatV0 } from "./official-flat-v0.ts";
import type { OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import {
  assignQuestionContentRole,
  validateQuestionContentRole,
  type QuestionContentRole,
} from "../question-content-role.ts";
import type { QbImportIssue } from "../errors.ts";

export const LESSON_CONTENT_QUESTION_V1 = "lesson_content_question_v1" as const;

const OPTION_CODES = ["A", "B", "C", "D", "E", "F"] as const;

/**
 * Adapter for the two operator-facing lesson question templates. The template
 * key supplies the semantic role out-of-band, so an editor cannot move a row
 * between student sections by adding/removing options or changing a cell.
 */
export function adaptLessonContentQuestionV1(
  source: Record<string, unknown>,
  role: QuestionContentRole,
  ctx: { file?: string; sheet?: string; rowNumber?: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const official = role === "OFFICIAL_BOOK_QUESTION";
  const normalizedInput: Record<string, unknown> = {
    ...source,
    content_role: role,
    interaction_type: official ? source.interaction_type : "SINGLE_CHOICE",
    grading_mode: official ? source.grading_mode : "AUTO_SINGLE",
    max_score: source.max_score ?? 1,
    allow_partial: false,
    explanation: official ? source.model_answer : source.explanation,
  };

  const adapted = adaptOfficialFlatV0(normalizedInput, ctx);
  if (!adapted.row) return adapted;

  const row = assignQuestionContentRole(adapted.row, role);
  row.answer_layer = {
    model_answer: official ? String(source.model_answer ?? "").trim() || null : null,
    explanation: String(source.explanation ?? "").trim() || null,
    option_rationales: OPTION_CODES.flatMap((optionCode, index) => {
      const whyWrong = String(source[`why_wrong_${index + 1}`] ?? "").trim();
      return whyWrong ? [{ option_code: optionCode, why_correct: null, why_wrong: whyWrong }] : [];
    }),
  };
  row.provenance = {
    ...row.provenance,
    source_contract: LESSON_CONTENT_QUESTION_V1,
    metadata: {
      ...(row.provenance.metadata ?? {}),
      content_role: role,
      ...(official && source.prompt_kind ? { prompt_kind: String(source.prompt_kind).trim() } : {}),
    },
  };

  const roleIssues = validateQuestionContentRole(row, {
    ...ctx,
    requireRole: true,
    expectedRole: role,
  });
  return {
    row: roleIssues.some((entry) => entry.row_blocking) ? null : row,
    issues: [...adapted.issues, ...roleIssues],
  };
}
