import {
  optionCodesFromCount,
  resolveCorrectAnswer,
  normalizeLf,
} from "../correct-answer.ts";
import { emptyNormalized, type OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES } from "../validation-codes.ts";

export const OFFICIAL_FLAT_V0 = "official_flat_v0" as const;

export type OfficialFlatV0Row = {
  id?: unknown;
  question_code?: unknown;
  question_text?: unknown;
  context_text?: unknown;
  option_a?: unknown;
  option_b?: unknown;
  option_c?: unknown;
  option_d?: unknown;
  option_e?: unknown;
  correct_answer?: unknown;
  subject_code?: unknown;
  lesson_code?: unknown;
  unit_code?: unknown;
  question_type?: unknown;
  explanation?: unknown;
  hint?: unknown;
};

export function adaptOfficialFlatV0(
  row: OfficialFlatV0Row,
  ctx: { file?: string; sheet?: string; rowNumber?: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const issues: QbImportIssue[] = [];
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? "Questions";
  const rowNumber = ctx.rowNumber ?? null;

  // Numeric-only id without question_code is rejected as unstable identity.
  const question_code = normalizeLf(String(row.question_code ?? ""));
  if (!question_code) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_QUESTION_CODE, {
        file,
        sheet,
        row: rowNumber,
        column: "question_code",
        suggested_fix:
          "لا تستخدم id الرقمي وحده؛ أضف question_code مستقراً.",
      }),
    );
  }

  const question_text = normalizeLf(String(row.question_text ?? ""));
  if (!question_text) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_QUESTION_TEXT, {
        file,
        sheet,
        row: rowNumber,
        column: "question_text",
        suggested_fix: "أضف نص السؤال.",
      }),
    );
  }

  const subject_code = normalizeLf(String(row.subject_code ?? ""));
  if (!subject_code) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_SUBJECT_CODE, {
        file,
        sheet,
        row: rowNumber,
        column: "subject_code",
        suggested_fix: "أضف subject_code.",
      }),
    );
  }

  const texts = [
    row.option_a,
    row.option_b,
    row.option_c,
    row.option_d,
    row.option_e,
  ]
    .map((v) => normalizeLf(String(v ?? "")))
    .filter(Boolean);

  const codes = optionCodesFromCount(texts.length);
  const base = texts.map((t, i) => ({ option_code: codes[i]!, option_text: t }));
  const resolved = resolveCorrectAnswer(row.correct_answer, base);
  if (!resolved.ok) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_INVALID_CORRECT_OPTION, {
        file,
        sheet,
        row: rowNumber,
        column: "correct_answer",
        suggested_fix: "حدد حرف الخيار أو نصه المطابق.",
      }),
    );
  }

  if (issues.some((i) => i.row_blocking)) {
    return { row: null, issues };
  }

  return {
    row: emptyNormalized({
      question_code,
      subject_code,
      question_text,
      stimulus_text: normalizeLf(String(row.context_text ?? "")) || null,
      question_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      lesson_code: normalizeLf(String(row.lesson_code ?? "")) || null,
      unit_code: normalizeLf(String(row.unit_code ?? "")) || null,
      options: resolved.ok ? resolved.options : [],
      legacy_correct_index_0_based: resolved.ok
        ? resolved.legacy_correct_index_0_based
        : null,
      model_answer: normalizeLf(String(row.explanation ?? "")) || null,
      source: "official_flat_v0",
    }),
    issues,
  };
}
