import {
  contiguousOptionBodies,
  optionCodesFromCount,
  resolveCorrectAnswer,
} from "../correct-answer.ts";
import { emptyNormalized, type OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES } from "../validation-codes.ts";
import { normalizeNumeric, normalizeText } from "../unicode.ts";
import { validateMediaUrl } from "../media-policy.ts";

export const OFFICIAL_FLAT_V0 = "official_flat_v0" as const;
export type OfficialFlatV0Row = Record<string, unknown>;

function parseStrictBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  const text = normalizeText(raw).toUpperCase();
  if (!text) return false;
  if (text === "TRUE" || text === "نعم") return true;
  if (text === "FALSE" || text === "لا") return false;
  return null;
}

function parseScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || normalizeText(raw) === "") return null;
  const numeric = normalizeNumeric(raw);
  if (numeric === null) return null;
  const value = Number(numeric);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function adaptOfficialFlatV0(
  row: OfficialFlatV0Row,
  ctx: { file?: string; sheet?: string; rowNumber?: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const issues: QbImportIssue[] = [];
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? "Questions";
  const rowNumber = ctx.rowNumber ?? null;
  const text = (key: string) => normalizeText(row[key]);

  const question_code = text("question_code");
  const question_text = text("question_text");
  const subject = text("subject_code");
  const lesson = text("lesson_code");

  for (const [value, column] of [
    [question_code, "question_code"],
    [question_text, "question_text"],
    [subject, "subject_code"],
  ] as const) {
    if (!value) {
      issues.push(issue(QB_IMPORT_CODES.MISSING_VALUE, { file, sheet, row: rowNumber, column }));
    }
  }

  const interaction = text("interaction_type");
  const grading = text("grading_mode");
  if (!["SINGLE_CHOICE", "SHORT_TEXT", "LONG_TEXT"].includes(interaction)) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_INTERACTION_TYPE, {
        file,
        sheet,
        row: rowNumber,
        column: "interaction_type",
      }),
    );
  }
  if (!["AUTO_SINGLE", "AUTO_TEXT", "MANUAL"].includes(grading)) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_GRADING_MODE, {
        file,
        sheet,
        row: rowNumber,
        column: "grading_mode",
      }),
    );
  }
  if (
    (interaction === "SINGLE_CHOICE" && grading !== "AUTO_SINGLE") ||
    (interaction === "SHORT_TEXT" && grading !== "AUTO_TEXT") ||
    (interaction === "LONG_TEXT" && grading !== "MANUAL")
  ) {
    issues.push(
      issue(QB_IMPORT_CODES.INCOMPATIBLE_TYPE_MODE, {
        file,
        sheet,
        row: rowNumber,
        column: "grading_mode",
      }),
    );
  }

  const score = parseScore(row.max_score);
  if (score === null) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_SCORE, {
        file,
        sheet,
        row: rowNumber,
        column: "max_score",
      }),
    );
  }
  const allowPartial = parseStrictBoolean(row.allow_partial);
  if (allowPartial === null) {
    issues.push(
      issue(QB_IMPORT_CODES.PARTIAL_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "allow_partial",
      }),
    );
  }
  if (allowPartial && interaction === "SINGLE_CHOICE") {
    issues.push(
      issue(QB_IMPORT_CODES.PARTIAL_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "allow_partial",
      }),
    );
  }

  const rawOptionSlots = [
    row.option_1,
    row.option_2,
    row.option_3,
    row.option_4,
    row.option_5,
    row.option_6,
  ].map((v) => normalizeText(v));
  const optionBodies = contiguousOptionBodies(rawOptionSlots);
  const baseForCorrect = rawOptionSlots.map((body, index) => ({
    option_code: optionCodesFromCount(6)[index]!,
    body,
  }));

  let options: OfficialNormalizedV1["options"] = [];
  if (interaction === "SINGLE_CHOICE") {
    if (optionBodies.length < 2 || optionBodies.length > 6) {
      issues.push(
        issue(QB_IMPORT_CODES.OPTION_COUNT, {
          file,
          sheet,
          row: rowNumber,
          column: "option_1",
        }),
      );
    }
    const correct = resolveCorrectAnswer(row.correct_index, baseForCorrect, { indexBase: 1 });
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
          row: rowNumber,
          column: "correct_index",
        }),
      );
    } else {
      options = correct.options.filter((o) => o.body);
    }
  } else if (optionBodies.length || text("correct_index")) {
    issues.push(
      issue(QB_IMPORT_CODES.ANSWER_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "option_1",
      }),
    );
  }

  const answers = text("accepted_answers")
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const unique = [...new Map(answers.map((a) => [a.toLowerCase(), a])).values()];
  if (answers.length !== unique.length) {
    issues.push(
      issue(QB_IMPORT_CODES.DUPLICATE_ACCEPTED_ANSWER, {
        file,
        sheet,
        row: rowNumber,
        column: "accepted_answers",
      }),
    );
  }
  if (interaction === "SHORT_TEXT" && !unique.length) {
    issues.push(
      issue(QB_IMPORT_CODES.ACCEPTED_ANSWER_REQUIRED, {
        file,
        sheet,
        row: rowNumber,
        column: "accepted_answers",
      }),
    );
  }
  if (interaction === "LONG_TEXT" && unique.length) {
    issues.push(
      issue(QB_IMPORT_CODES.ANSWER_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "accepted_answers",
      }),
    );
  }

  const mediaUrl = text("media_url");
  const media = mediaUrl ? validateMediaUrl(mediaUrl) : null;
  const suppliedMediaType = text("media_type");
  const mediaType = suppliedMediaType;
  if (mediaUrl && !media?.ok) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_URL_INVALID, {
        file,
        sheet,
        row: rowNumber,
        column: "media_url",
      }),
    );
  }
  if (mediaUrl && !mediaType) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_TYPE_REQUIRED, {
        file,
        sheet,
        row: rowNumber,
        column: "media_type",
      }),
    );
  }
  if (mediaUrl && mediaType && !["image", "audio", "video", "document"].includes(mediaType)) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_TYPE_REQUIRED, {
        file, sheet, row: rowNumber, column: "media_type",
      }),
    );
  }

  if (issues.some((i) => i.row_blocking)) return { row: null, issues };

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
        interaction_type: interaction as OfficialNormalizedV1["revision"]["interaction_type"],
        grading_mode: grading as OfficialNormalizedV1["revision"]["grading_mode"],
        question_text,
        stimulus_text: text("stimulus_text") || null,
        max_score: score!,
        allow_partial: allowPartial!,
      },
      options,
      accepted_answers: unique.map((answer_text, sort_order) => ({
        answer_text,
        normalized_answer: answer_text.toLowerCase(),
        sort_order,
      })),
      solutions: text("explanation") ? [{ body: text("explanation") }] : [],
      media:
        media?.ok && mediaType
          ? [{ url: media.url, media_type: mediaType, alt_text: text("media_alt") || null }]
          : [],
      targets,
      provenance: { source_contract: OFFICIAL_FLAT_V0, source_row: rowNumber },
    }),
    issues,
  };
}
