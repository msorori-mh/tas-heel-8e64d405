import {
  contiguousOptionBodies,
  optionCodesFromCount,
  resolveCorrectAnswer,
} from "../correct-answer.ts";
import { emptyNormalized, type OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES } from "../validation-codes.ts";
import { inferMediaType, validateMediaUrl } from "../media-policy.ts";
import { normalizeText } from "../unicode.ts";

export const LEGACY_FLAT_15COL = "legacy_flat_15col" as const;

export const LEGACY_FLAT_HEADERS = [
  "code",
  "lesson_code",
  "subject_code",
  "question",
  "answer_a",
  "answer_b",
  "answer_c",
  "answer_d",
  "correct_index",
  "explanation",
  "question_type",
  "year",
  "semester",
  "sort_order",
  "media_url",
] as const;

export type LegacyFlat15Row = Record<string, unknown> | unknown[];

export function legacyArrayToRow(values: unknown[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (let i = 0; i < LEGACY_FLAT_HEADERS.length; i += 1) {
    row[LEGACY_FLAT_HEADERS[i]!] = values[i] ?? "";
  }
  return row;
}

export function adaptLegacyFlat15Col(
  input: LegacyFlat15Row,
  ctx: { file?: string; sheet?: string; rowNumber?: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const issues: QbImportIssue[] = [];
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? "Questions";
  const source_row = ctx.rowNumber ?? null;

  if (Array.isArray(input) && input.length !== 15) {
    issues.push(
      issue(QB_IMPORT_CODES.LEGACY_COLUMN_COUNT, {
        file,
        sheet,
        row: source_row,
        file_blocking: true,
        row_blocking: false,
      }),
    );
    return { row: null, issues };
  }

  const row = Array.isArray(input) ? legacyArrayToRow(input) : input;
  const text = (key: string) => normalizeText(row[key]);
  const question_code = text("code");
  const question = text("question");
  const subject = text("subject_code");
  const lesson = text("lesson_code");

  for (const [value, column] of [
    [question_code, "code"],
    [question, "question"],
    [subject, "subject_code"],
  ] as const) {
    if (!value) {
      issues.push(issue(QB_IMPORT_CODES.MISSING_VALUE, { file, sheet, row: source_row, column }));
    }
  }

  const type = text("question_type");
  if (type === "auto_text") {
    issues.push(
      issue(QB_IMPORT_CODES.LEGACY_INFORMATION_LOSS, {
        file,
        sheet,
        row: source_row,
        column: "question_type",
      }),
    );
  }
  if (!["mcq", "manual", "auto_text"].includes(type)) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_INTERACTION_TYPE, {
        file,
        sheet,
        row: source_row,
        column: "question_type",
      }),
    );
  }

  const optionBodies = contiguousOptionBodies([
    row.answer_a,
    row.answer_b,
    row.answer_c,
    row.answer_d,
  ]);
  const base = optionBodies.map((body, index) => ({
    option_code: optionCodesFromCount(optionBodies.length)[index]!,
    body,
  }));

  let options: OfficialNormalizedV1["options"] = [];
  if (type === "mcq") {
    if (optionBodies.length < 2 || optionBodies.length > 4) {
      issues.push(
        issue(QB_IMPORT_CODES.OPTION_COUNT, {
          file,
          sheet,
          row: source_row,
          column: "answer_a",
        }),
      );
    }
    const correct = resolveCorrectAnswer(row.correct_index, base, { indexBase: 0 });
    if (!correct.ok) {
      const code =
        correct.reason === "EMPTY"
          ? QB_IMPORT_CODES.MISSING_CORRECT_INDEX
          : correct.reason === "EMPTY_OPTION"
            ? QB_IMPORT_CODES.CORRECT_INDEX_NO_OPTION
            : QB_IMPORT_CODES.INVALID_CORRECT_INDEX;
      issues.push(
        issue(code, {
          file,
          sheet,
          row: source_row,
          column: "correct_index",
        }),
      );
    } else {
      options = correct.options;
    }
  }

  const mediaUrl = text("media_url");
  const media = mediaUrl ? validateMediaUrl(mediaUrl) : null;
  const mediaType = media?.ok ? inferMediaType(media.url) : null;
  if (mediaUrl && !media?.ok) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_URL_INVALID, {
        file,
        sheet,
        row: source_row,
        column: "media_url",
      }),
    );
  }
  if (mediaUrl && !mediaType) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_TYPE_REQUIRED, {
        file,
        sheet,
        row: source_row,
        column: "media_url",
      }),
    );
  }

  if (issues.some((item) => item.row_blocking || item.file_blocking)) {
    return { row: null, issues };
  }

  const interaction = type === "mcq" ? "SINGLE_CHOICE" : "LONG_TEXT";
  const grading = type === "mcq" ? "AUTO_SINGLE" : "MANUAL";
  // LONG_TEXT keeps subject as primary even when a lesson target is present.
  const targets: OfficialNormalizedV1["targets"] = lesson
    ? interaction === "LONG_TEXT"
      ? [
          { target_type: "SUBJECT", target_code: subject, is_primary: true },
          { target_type: "LESSON", target_code: lesson, is_primary: false },
        ]
      : [
          { target_type: "SUBJECT", target_code: subject, is_primary: false },
          { target_type: "LESSON", target_code: lesson, is_primary: true },
        ]
    : [{ target_type: "SUBJECT", target_code: subject, is_primary: true }];

  return {
    row: emptyNormalized({
      question_code,
      revision: {
        status: "DRAFT",
        interaction_type: interaction,
        grading_mode: grading,
        question_text: question,
        stimulus_text: null,
        // Legacy has no score column; manual rows use oracle default 5, MCQ uses 1.
        max_score: interaction === "LONG_TEXT" ? 5 : 1,
        allow_partial: false,
      },
      options,
      accepted_answers: [],
      solutions: text("explanation") ? [{ body: text("explanation") }] : [],
      media:
        media?.ok && mediaType
          ? [{ url: media.url, media_type: mediaType, alt_text: null }]
          : [],
      targets,
      provenance: {
        source_contract: LEGACY_FLAT_15COL,
        source_row,
      },
    }),
    issues,
  };
}
