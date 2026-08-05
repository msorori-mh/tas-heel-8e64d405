import type { OfficialNormalizedV1 } from "./official-normalized-v1.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { hasUnsafeUnicode, isFormulaLike, mixedNumeralScripts } from "./unicode.ts";
import { canonicalHash } from "./canonical-json.ts";

export function contentFingerprint(row: OfficialNormalizedV1): string {
  return canonicalHash({
    revision: row.revision,
    options: row.options,
    accepted_answers: row.accepted_answers,
    solutions: row.solutions,
    solution_steps: row.solution_steps,
    media: row.media,
    targets: row.targets,
  });
}

/** Provenance is intentionally separate from content, including source_row. */
export function provenanceFingerprint(row: OfficialNormalizedV1): string {
  return canonicalHash(row.provenance);
}

export type CatalogLookup = {
  subjects: Set<string>;
  lessons: Set<string>;
  lessonSubjects?: Map<string, string>;
  authorizedSubjects?: Set<string>;
  existing?: Map<string, string>;
};

export function validateNormalizedRow(
  row: OfficialNormalizedV1,
  ctx: {
    file?: string;
    sheet?: string;
    rowNumber?: number;
    catalog?: CatalogLookup;
    seenCodes?: Set<string>;
    seenFingerprints?: Set<string>;
  },
): QbImportIssue[] {
  const issues: QbImportIssue[] = [];
  const base = {
    file: ctx.file ?? null,
    sheet: ctx.sheet ?? null,
    row: ctx.rowNumber ?? null,
  };
  const { interaction_type: type, grading_mode: grading } = row.revision;

  if (
    type === "MULTIPLE_CHOICE" ||
    !["SINGLE_CHOICE", "SHORT_TEXT", "LONG_TEXT"].includes(type)
  ) {
    issues.push(issue(QB_IMPORT_CODES.INVALID_INTERACTION_TYPE, base));
  }
  if (!["AUTO_SINGLE", "AUTO_TEXT", "MANUAL"].includes(grading)) {
    issues.push(issue(QB_IMPORT_CODES.INVALID_GRADING_MODE, base));
  }
  if (
    (type === "SINGLE_CHOICE" && grading !== "AUTO_SINGLE") ||
    (type === "SHORT_TEXT" && grading !== "AUTO_TEXT") ||
    (type === "LONG_TEXT" && grading !== "MANUAL")
  ) {
    issues.push(issue(QB_IMPORT_CODES.INCOMPATIBLE_TYPE_MODE, base));
  }
  if (!Number.isFinite(row.revision.max_score) || row.revision.max_score <= 0) {
    issues.push(issue(QB_IMPORT_CODES.INVALID_SCORE, base));
  }
  if (
    type === "SINGLE_CHOICE" &&
    (row.options.length < 2 ||
      row.options.length > 6 ||
      row.options.filter((o) => o.is_correct).length !== 1)
  ) {
    issues.push(issue(QB_IMPORT_CODES.OPTION_COUNT, base));
  }
  if (
    new Set(row.options.map((o) => o.option_code)).size !== row.options.length ||
    new Set(row.options.map((o) => o.body.normalize("NFC"))).size !== row.options.length
  ) {
    issues.push(issue(QB_IMPORT_CODES.DUPLICATE_OPTION, base));
  }
  if (type === "SHORT_TEXT" && !row.accepted_answers.length) {
    issues.push(issue(QB_IMPORT_CODES.ACCEPTED_ANSWER_REQUIRED, base));
  }
  if (type === "LONG_TEXT" && (row.options.length || row.accepted_answers.length)) {
    issues.push(issue(QB_IMPORT_CODES.ANSWER_NOT_ALLOWED, base));
  }

  const stringValues = [
    row.question_code,
    row.revision.question_text,
    row.revision.stimulus_text ?? "",
    ...row.options.map((o) => o.body),
    ...row.accepted_answers.map((a) => a.answer_text),
    ...row.solutions.map((s) => s.body),
    ...row.media.map((m) => m.url),
  ];

  for (const value of stringValues) {
    if (hasUnsafeUnicode(value)) {
      issues.push(issue(QB_IMPORT_CODES.MALFORMED_UNICODE, base));
    } else if (isFormulaLike(value)) {
      issues.push(issue(QB_IMPORT_CODES.FORMULA_CELL, base));
    }
  }

  const subject = row.targets.find((t) => t.target_type === "SUBJECT");
  const lesson = row.targets.find((t) => t.target_type === "LESSON");

  if (ctx.catalog && subject) {
    if (!ctx.catalog.subjects.has(subject.target_code)) {
      issues.push(issue(QB_IMPORT_CODES.UNKNOWN_SUBJECT, base));
    } else if (
      ctx.catalog.authorizedSubjects &&
      !ctx.catalog.authorizedSubjects.has(subject.target_code)
    ) {
      issues.push(issue(QB_IMPORT_CODES.CROSS_SUBJECT_MAPPING, base));
    }
  }
  if (ctx.catalog && lesson && !ctx.catalog.lessons.has(lesson.target_code)) {
    issues.push(issue(QB_IMPORT_CODES.UNKNOWN_LESSON, base));
  }
  if (
    ctx.catalog?.lessonSubjects &&
    subject &&
    lesson &&
    ctx.catalog.lessonSubjects.get(lesson.target_code) !== subject.target_code
  ) {
    issues.push(issue(QB_IMPORT_CODES.CROSS_LESSON_MAPPING, base));
  }

  if (ctx.seenCodes) {
    if (ctx.seenCodes.has(row.question_code)) {
      issues.push(
        issue(QB_IMPORT_CODES.DUPLICATE_CODE_IN_FILE, {
          ...base,
          file_blocking: true,
          row_blocking: false,
        }),
      );
    } else {
      ctx.seenCodes.add(row.question_code);
    }
  }

  if (ctx.catalog?.existing?.has(row.question_code)) {
    const prior = ctx.catalog.existing.get(row.question_code);
    const current = contentFingerprint(row);
    if (prior === "CATALOG_EXISTS") {
      issues.push(
        issue(QB_IMPORT_CODES.DUPLICATE_CODE_EXISTS, {
          ...base,
          file_blocking: true,
          row_blocking: false,
        }),
      );
    } else if (prior && prior !== current) {
      issues.push(
        issue(QB_IMPORT_CODES.IMPORT_REPLAY_CONFLICT, {
          ...base,
          file_blocking: true,
          row_blocking: false,
        }),
      );
    }
  }

  if (ctx.seenFingerprints) {
    const fingerprint = contentFingerprint(row);
    ctx.seenFingerprints.add(fingerprint);
  }

  if (mixedNumeralScripts(row.question_code) || mixedNumeralScripts(row.revision.question_text)) {
    issues.push(issue(QB_IMPORT_CODES.MIXED_NUMERAL_SCRIPTS, base));
  }
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(row.question_code)) {
    issues.push(issue(QB_IMPORT_CODES.SCIENTIFIC_NOTATION_LOSS, base));
  }

  if (!/^[A-Za-z0-9\u0660-\u0669\u06f0-\u06f9][A-Za-z0-9\u0660-\u0669\u06f0-\u06f9._-]{0,63}$/.test(row.question_code)) {
    issues.push(
      issue(QB_IMPORT_CODES.QUESTION_CODE_INVALID, {
        ...base,
        column: "question_code",
      }),
    );
  }

  return issues;
}
