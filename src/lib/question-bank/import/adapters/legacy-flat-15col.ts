import {
  optionCodesFromCount,
  resolveCorrectAnswer,
  normalizeLf,
} from "../correct-answer.ts";
import {
  emptyNormalized,
  type OfficialNormalizedV1,
  type QuestionType,
  type GradingMode,
} from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES } from "../validation-codes.ts";

export const LEGACY_FLAT_15COL = "legacy_flat_15col" as const;

/** Expected header tokens (subset) for shift detection. */
export const LEGACY_FLAT_HEADERS = [
  "question_code",
  "question_text",
  "option_1",
  "option_2",
  "option_3",
  "option_4",
  "correct_index",
  "lesson_code",
  "subject_code",
] as const;

export type LegacyFlat15Row = {
  question_code?: unknown;
  question_text?: unknown;
  option_1?: unknown;
  option_2?: unknown;
  option_3?: unknown;
  option_4?: unknown;
  option_5?: unknown;
  option_6?: unknown;
  correct_index?: unknown;
  lesson_code?: unknown;
  subject_code?: unknown;
  unit_code?: unknown;
  grade_code?: unknown;
  semester_code?: unknown;
  explanation?: unknown;
  question_type?: unknown;
  max_score?: unknown;
  source?: unknown;
  tags?: unknown;
  media_reference?: unknown;
  requires_media?: unknown;
};

function mapType(raw: unknown): QuestionType {
  const t = String(raw ?? "SINGLE_CHOICE").trim().toUpperCase();
  if (t === "MCQ" || t === "SINGLE" || t === "SINGLE_CHOICE") return "SINGLE_CHOICE";
  if (t === "MULTI" || t === "MULTI_CHOICE") return "MULTI_CHOICE";
  if (t === "SHORT" || t === "SHORT_TEXT") return "SHORT_TEXT";
  if (t === "LONG" || t === "LONG_TEXT" || t === "ESSAY") return "LONG_TEXT";
  if (t === "NUMERIC") return "NUMERIC";
  if (t === "MANUAL") return "MANUAL";
  return "SINGLE_CHOICE";
}

function gradingFor(type: QuestionType): GradingMode {
  if (type === "MANUAL" || type === "LONG_TEXT") return "MANUAL";
  if (type === "SHORT_TEXT" || type === "NUMERIC") return "AUTO_TEXT";
  return "AUTO_SINGLE";
}

export function adaptLegacyFlat15Col(
  row: LegacyFlat15Row,
  ctx: { file?: string; sheet?: string; rowNumber?: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const issues: QbImportIssue[] = [];
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? "Questions";
  const rowNumber = ctx.rowNumber ?? null;

  const question_code = normalizeLf(String(row.question_code ?? ""));
  const question_text = normalizeLf(String(row.question_text ?? ""));
  const subject_code = normalizeLf(String(row.subject_code ?? ""));

  if (!question_code) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_QUESTION_CODE, {
        file,
        sheet,
        row: rowNumber,
        column: "question_code",
        suggested_fix: "أضف رمز سؤال فريداً.",
      }),
    );
  }
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
  if (!subject_code) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_REQUIRED_SUBJECT_CODE, {
        file,
        sheet,
        row: rowNumber,
        column: "subject_code",
        suggested_fix: "أضف رمز المادة.",
      }),
    );
  }

  const optionTexts = [
    row.option_1,
    row.option_2,
    row.option_3,
    row.option_4,
    row.option_5,
    row.option_6,
  ]
    .map((v) => normalizeLf(String(v ?? "")))
    .filter((t) => t.length > 0);

  const question_type = mapType(row.question_type);
  const grading_mode = gradingFor(question_type);
  const codes = optionCodesFromCount(optionTexts.length);
  const baseOptions = optionTexts.map((t, i) => ({
    option_code: codes[i]!,
    option_text: t,
  }));

  let options = baseOptions.map((o, i) => ({
    ...o,
    is_correct: false,
    sort_order: i,
  }));
  let legacy: number | null = null;

  if (question_type === "SINGLE_CHOICE" || question_type === "MULTI_CHOICE") {
    if (optionTexts.length < 2 || optionTexts.length > 6) {
      issues.push(
        issue(QB_IMPORT_CODES.QB_IMPORT_OPTION_COUNT_INVALID, {
          file,
          sheet,
          row: rowNumber,
          column: "option_1",
          suggested_fix: "استخدم بين خيارين وستة خيارات.",
        }),
      );
    }
    const resolved = resolveCorrectAnswer(row.correct_index, baseOptions, {
      allowMultiple: question_type === "MULTI_CHOICE",
    });
    if (!resolved.ok) {
      const code =
        resolved.reason === "ZERO_BASED_SUSPECT"
          ? QB_IMPORT_CODES.QB_IMPORT_ZERO_BASED_INDEX_SUSPECT
          : resolved.reason === "MULTIPLE_NOT_ALLOWED"
            ? QB_IMPORT_CODES.QB_IMPORT_MULTIPLE_CORRECT_NOT_ALLOWED
            : QB_IMPORT_CODES.QB_IMPORT_INVALID_CORRECT_OPTION;
      issues.push(
        issue(code, {
          file,
          sheet,
          row: rowNumber,
          column: "correct_index",
          suggested_fix:
            resolved.reason === "ZERO_BASED_SUSPECT"
              ? "استخدم فهرساً أساس 1 (1=الخيار الأول) أو حرفاً مثل A."
              : "حدد خياراً موجوداً بحرف أو فهرس 1-based أو نص الخيار.",
        }),
      );
    } else {
      options = resolved.options;
      legacy = resolved.legacy_correct_index_0_based;
    }
  }

  if (grading_mode === "MANUAL") {
    const model = normalizeLf(String(row.explanation ?? ""));
    if (!model) {
      issues.push(
        issue(QB_IMPORT_CODES.QB_IMPORT_MANUAL_GRADING_REQUIRES_SOLUTION, {
          file,
          sheet,
          row: rowNumber,
          column: "explanation",
          suggested_fix: "أضف نموذج إجابة أو معيار تصحيح للأسئلة اليدوية.",
        }),
      );
    }
  }

  const requires_media =
    String(row.requires_media ?? "").toLowerCase() === "true" ||
    row.requires_media === true ||
    row.requires_media === 1;
  const media_reference = normalizeLf(String(row.media_reference ?? "")) || null;
  if (requires_media && !media_reference) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_MEDIA_REFERENCE_MISSING, {
        file,
        sheet,
        row: rowNumber,
        column: "media_reference",
        suggested_fix: "أضف مرجع ملف الوسائط أو عطّل requires_media.",
      }),
    );
  }

  if (issues.some((i) => i.row_blocking)) {
    return { row: null, issues };
  }

  const tags = String(row.tags ?? "")
    .split(/[|,]/)
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    row: emptyNormalized({
      question_code,
      subject_code,
      question_text,
      question_type,
      grading_mode,
      lesson_code: normalizeLf(String(row.lesson_code ?? "")) || null,
      unit_code: normalizeLf(String(row.unit_code ?? "")) || null,
      grade_code: normalizeLf(String(row.grade_code ?? "")) || null,
      semester_code: normalizeLf(String(row.semester_code ?? "")) || null,
      max_score: Number(row.max_score ?? 1) || 1,
      options,
      model_answer: normalizeLf(String(row.explanation ?? "")) || null,
      source: normalizeLf(String(row.source ?? "")) || null,
      tags,
      media_reference,
      requires_media,
      legacy_correct_index_0_based: legacy,
      revision_code: null,
    }),
    issues,
  };
}
