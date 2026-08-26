import {
  contiguousOptionBodies,
  optionCodesFromCount,
  resolveCorrectAnswer,
} from "../correct-answer.ts";
import { emptyNormalized, type OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES, type QbImportCode } from "../validation-codes.ts";
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

  const makeIssue = (code: QbImportCode, opts: Partial<QbImportIssue> = {}) => {
    return issue(code, {
      file,
      sheet,
      row: source_row,
      stage: "ROW_VALIDATION",
      source_subsystem: "legacy-flat-15col",
      ...opts,
    });
  };

  if (Array.isArray(input) && input.length !== 15) {
    issues.push(
      makeIssue(QB_IMPORT_CODES.LEGACY_COLUMN_COUNT, {
        stage: "ADAPTER_DETECT",
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
      issues.push(makeIssue(QB_IMPORT_CODES.MISSING_VALUE, { column }));
    }
  }

  const type = text("question_type");
  if (type === "auto_text") {
    issues.push(
      makeIssue(QB_IMPORT_CODES.LEGACY_INFORMATION_LOSS, {
        column: "question_type",
        row_blocking: true,
      }),
    );
  }
  if (!["mcq", "manual", "auto_text"].includes(type)) {
    issues.push(
      makeIssue(QB_IMPORT_CODES.INVALID_INTERACTION_TYPE, {
        column: "question_type",
      }),
    );
  }

  const rawOptionSlots = [row.answer_a, row.answer_b, row.answer_c, row.answer_d].map((v) =>
    normalizeText(v),
  );
  const optionBodies = contiguousOptionBodies(rawOptionSlots);
  const baseForCorrect = rawOptionSlots.map((body, index) => ({
    option_code: optionCodesFromCount(4)[index]!,
    body,
  }));

  let options: OfficialNormalizedV1["options"] = [];
  if (type === "mcq") {
    if (optionBodies.length < 2 || optionBodies.length > 4) {
      issues.push(
        makeIssue(QB_IMPORT_CODES.OPTION_COUNT, {
          source_subsystem: "correct-answer",
          column: "answer_a",
        }),
      );
    }
    const correct = resolveCorrectAnswer(row.correct_index, baseForCorrect, { indexBase: 0 });
    if (!correct.ok) {
      const code =
        correct.reason === "EMPTY"
          ? QB_IMPORT_CODES.MISSING_CORRECT_INDEX
          : correct.reason === "EMPTY_OPTION"
            ? QB_IMPORT_CODES.CORRECT_INDEX_NO_OPTION
            : QB_IMPORT_CODES.INVALID_CORRECT_INDEX;
      issues.push(
        makeIssue(code, {
          source_subsystem: "correct-answer",
          column: "correct_index",
        }),
      );
    } else {
      options = correct.options.filter((o) => o.body);
    }
  }

  const mediaUrl = text("media_url");
  const media = mediaUrl ? validateMediaUrl(mediaUrl) : null;
  const mediaType = media?.ok ? inferMediaType(media.url) : null;
  if (mediaUrl && !media?.ok) {
    issues.push(
      makeIssue(QB_IMPORT_CODES.MEDIA_URL_INVALID, {
        source_subsystem: "media-policy",
        column: "media_url",
      }),
    );
  }
  if (mediaUrl && !mediaType) {
    issues.push(
      makeIssue(QB_IMPORT_CODES.MEDIA_TYPE_REQUIRED, {
        source_subsystem: "media-policy",
        column: "media_url",
      }),
    );
  }

  if (issues.some((item) => item.row_blocking || item.file_blocking)) {
    return { row: null, issues };
  }

  const interaction = type === "mcq" ? "SINGLE_CHOICE" : "LONG_TEXT";
  const grading = type === "mcq" ? "AUTO_SINGLE" : "MANUAL";
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
        max_score: 1,
        allow_partial: false,
      },
      options,
      accepted_answers: [],
      solutions: text("explanation") ? [{ body: text("explanation") }] : [],
      media:
        mediaUrl && media?.ok && mediaType
          ? [
              {
                media_type: mediaType,
                url: media.url,
                alt_text: null,
              },
            ]
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
