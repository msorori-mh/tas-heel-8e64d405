import {
  optionCodesFromCount,
  resolveCorrectAnswer,
  normalizeLf,
} from "../correct-answer.ts";
import { emptyNormalized, type OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES } from "../validation-codes.ts";

export const TEACHER_FLAT_AR_V0 = "teacher_flat_ar_v0" as const;

export type TeacherFlatArRow = {
  /** Arabic / loose headers mapped by caller */
  نص_السؤال?: unknown;
  question_text?: unknown;
  الخيار_أ?: unknown;
  الخيار_ب?: unknown;
  الخيار_ج?: unknown;
  الخيار_د?: unknown;
  option_a?: unknown;
  option_b?: unknown;
  option_c?: unknown;
  option_d?: unknown;
  الإجابة_الصحيحة?: unknown;
  correct_answer?: unknown;
  المادة?: unknown;
  subject_code?: unknown;
  الدرس?: unknown;
  lesson_code?: unknown;
  رمز_السؤال?: unknown;
  question_code?: unknown;
  الشرح?: unknown;
  explanation?: unknown;
};

export function adaptTeacherFlatArV0(
  row: TeacherFlatArRow,
  ctx: { file?: string; sheet?: string; rowNumber?: number; syntheticCode?: string },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const issues: QbImportIssue[] = [];
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? "Sheet1";
  const rowNumber = ctx.rowNumber ?? null;

  const question_text = normalizeLf(
    String(row.question_text ?? row["نص_السؤال"] ?? ""),
  );
  const subject_code = normalizeLf(
    String(row.subject_code ?? row["المادة"] ?? ""),
  );
  let question_code = normalizeLf(
    String(row.question_code ?? row["رمز_السؤال"] ?? ""),
  );
  if (!question_code && ctx.syntheticCode) {
    question_code = ctx.syntheticCode;
  }

  if (!question_text) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_QUESTION_TEXT, {
        file,
        sheet,
        row: rowNumber,
        column: "نص_السؤال",
        suggested_fix: "أضف نص السؤال.",
      }),
    );
  }
  if (!question_code) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_QUESTION_CODE, {
        file,
        sheet,
        row: rowNumber,
        column: "رمز_السؤال",
        suggested_fix: "أضف رمزاً أو اسمح بتوليد رمز مؤقت في الواجهة.",
      }),
    );
  }
  if (!subject_code) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_SUBJECT_CODE, {
        file,
        sheet,
        row: rowNumber,
        column: "المادة",
        suggested_fix: "حدد رمز المادة.",
      }),
    );
  }

  const texts = [
    row.option_a ?? row["الخيار_أ"],
    row.option_b ?? row["الخيار_ب"],
    row.option_c ?? row["الخيار_ج"],
    row.option_d ?? row["الخيار_د"],
  ]
    .map((v) => normalizeLf(String(v ?? "")))
    .filter(Boolean);

  if (texts.length < 2) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_OPTION_COUNT_INVALID, {
        file,
        sheet,
        row: rowNumber,
        column: "الخيار_أ",
        suggested_fix: "أضف خيارين على الأقل.",
      }),
    );
  }

  const codes = optionCodesFromCount(texts.length);
  const base = texts.map((t, i) => ({ option_code: codes[i]!, option_text: t }));
  const correctRaw = row.correct_answer ?? row["الإجابة_الصحيحة"];
  const resolved = resolveCorrectAnswer(correctRaw, base);

  if (!resolved.ok) {
    issues.push(
      issue(
        resolved.reason === "ZERO_BASED_SUSPECT"
          ? QB_IMPORT_CODES.QB_IMPORT_ZERO_BASED_INDEX_SUSPECT
          : QB_IMPORT_CODES.QB_IMPORT_INVALID_CORRECT_OPTION,
        {
          file,
          sheet,
          row: rowNumber,
          column: "الإجابة_الصحيحة",
          suggested_fix: "استخدم A/B/C/D أو 1–4 أو نص الخيار حرفياً.",
        },
      ),
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
      question_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      lesson_code: normalizeLf(String(row.lesson_code ?? row["الدرس"] ?? "")) || null,
      options: resolved.ok ? resolved.options : [],
      legacy_correct_index_0_based: resolved.ok
        ? resolved.legacy_correct_index_0_based
        : null,
      model_answer: normalizeLf(String(row.explanation ?? row["الشرح"] ?? "")) || null,
      source: "teacher_flat_ar_v0",
    }),
    issues,
  };
}
