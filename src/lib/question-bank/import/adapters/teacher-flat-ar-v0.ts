import {
  contiguousOptionBodies,
  optionCodesFromCount,
  resolveCorrectAnswer,
} from "../correct-answer.ts";
import { emptyNormalized, type OfficialNormalizedV1 } from "../official-normalized-v1.ts";
import { issue, type QbImportIssue } from "../errors.ts";
import { QB_IMPORT_CODES } from "../validation-codes.ts";
import { normalizeNumeric, normalizeText } from "../unicode.ts";
import { inferMediaType, validateMediaUrl } from "../media-policy.ts";

export const TEACHER_FLAT_AR_V0 = "teacher_flat_ar_v0" as const;

export type TeacherFlatArRow = Record<string, unknown>;

function parseStrictBoolean(raw: unknown): boolean | null {
  const text = normalizeText(raw).toUpperCase();
  if (!text) return false;
  if (text === "نعم" || text === "TRUE") return true;
  if (text === "لا" || text === "FALSE") return false;
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

export function adaptTeacherFlatArV0(
  row: TeacherFlatArRow,
  ctx: { file?: string; sheet?: string; rowNumber?: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  const issues: QbImportIssue[] = [];
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? "Sheet1";
  const rowNumber = ctx.rowNumber ?? null;
  const text = (key: string) => normalizeText(row[key]);

  const question_text = text("نص_السؤال");
  const subject_code = text("رمز_المادة");
  const question_code = text("رمز_السؤال");
  const lesson_code = text("رمز_الدرس");

  if (!question_text) {
    issues.push(issue(QB_IMPORT_CODES.MISSING_VALUE, { file, sheet, row: rowNumber, column: "نص_السؤال" }));
  }
  if (!question_code) {
    issues.push(issue(QB_IMPORT_CODES.MISSING_VALUE, { file, sheet, row: rowNumber, column: "رمز_السؤال" }));
  }
  if (!subject_code) {
    issues.push(issue(QB_IMPORT_CODES.MISSING_VALUE, { file, sheet, row: rowNumber, column: "رمز_المادة" }));
  }

  const typeRaw = text("نوع_السؤال");
  const mapped =
    typeRaw === "اختيار_واحد"
      ? (["SINGLE_CHOICE", "AUTO_SINGLE"] as const)
      : typeRaw === "نص_تلقائي"
        ? (["SHORT_TEXT", "AUTO_TEXT"] as const)
        : typeRaw === "مقالي"
          ? (["LONG_TEXT", "MANUAL"] as const)
          : null;
  if (!mapped) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_INTERACTION_TYPE, {
        file,
        sheet,
        row: rowNumber,
        column: "نوع_السؤال",
      }),
    );
  }

  const score = parseScore(row["الدرجة"]);
  if (score === null) {
    issues.push(
      issue(QB_IMPORT_CODES.INVALID_SCORE, {
        file,
        sheet,
        row: rowNumber,
        column: "الدرجة",
      }),
    );
  }

  const allowPartial = parseStrictBoolean(row["السماح_بالجزئي"]);
  if (allowPartial === null) {
    issues.push(
      issue(QB_IMPORT_CODES.PARTIAL_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "السماح_بالجزئي",
      }),
    );
  }
  if (allowPartial && mapped?.[0] === "SINGLE_CHOICE") {
    issues.push(
      issue(QB_IMPORT_CODES.PARTIAL_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "السماح_بالجزئي",
      }),
    );
  }

  const rawOptionSlots = [
    row["الخيار_١"],
    row["الخيار_٢"],
    row["الخيار_٣"],
    row["الخيار_٤"],
    row["الخيار_٥"],
    row["الخيار_٦"],
  ].map((v) => normalizeText(v));
  const optionBodies = contiguousOptionBodies(rawOptionSlots);
  const baseForCorrect = rawOptionSlots.map((body, i) => ({
    option_code: optionCodesFromCount(6)[i]!,
    body,
  }));

  let options: OfficialNormalizedV1["options"] = [];
  if (mapped?.[0] === "SINGLE_CHOICE") {
    if (optionBodies.length < 2 || optionBodies.length > 6) {
      issues.push(
        issue(QB_IMPORT_CODES.OPTION_COUNT, {
          file,
          sheet,
          row: rowNumber,
          column: "الخيار_١",
        }),
      );
    }
    const resolved = resolveCorrectAnswer(row["رقم_الإجابة_الصحيحة"], baseForCorrect, {
      indexBase: 1,
    });
    if (!resolved.ok) {
      const code =
        resolved.reason === "EMPTY"
          ? QB_IMPORT_CODES.MISSING_CORRECT_INDEX
          : resolved.reason === "EMPTY_OPTION"
            ? QB_IMPORT_CODES.CORRECT_INDEX_NO_OPTION
            : QB_IMPORT_CODES.INVALID_CORRECT_INDEX;
      issues.push(
        issue(code, {
          file,
          sheet,
          row: rowNumber,
          column: "رقم_الإجابة_الصحيحة",
        }),
      );
    } else {
      options = resolved.options.filter((o) => o.body);
    }
  } else if (
    optionBodies.length > 0 &&
    mapped &&
    (mapped[0] === "SHORT_TEXT" || mapped[0] === "LONG_TEXT")
  ) {
    issues.push(
      issue(QB_IMPORT_CODES.ANSWER_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "الخيار_١",
      }),
    );
  }

  const acceptedRaw = text("الإجابات_المقبولة")
    .split(/\r?\n|\|/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const deduped = [...new Map(acceptedRaw.map((a) => [a.toLowerCase(), a])).values()];
  if (acceptedRaw.length !== deduped.length) {
    issues.push(
      issue(QB_IMPORT_CODES.DUPLICATE_ACCEPTED_ANSWER, {
        file,
        sheet,
        row: rowNumber,
        column: "الإجابات_المقبولة",
      }),
    );
  }
  if (mapped?.[0] === "SHORT_TEXT" && !deduped.length) {
    issues.push(
      issue(QB_IMPORT_CODES.ACCEPTED_ANSWER_REQUIRED, {
        file,
        sheet,
        row: rowNumber,
        column: "الإجابات_المقبولة",
      }),
    );
  }
  if (mapped?.[0] === "LONG_TEXT" && (deduped.length || text("رقم_الإجابة_الصحيحة"))) {
    issues.push(
      issue(QB_IMPORT_CODES.ANSWER_NOT_ALLOWED, {
        file,
        sheet,
        row: rowNumber,
        column: "الإجابات_المقبولة",
      }),
    );
  }

  const mediaUrl = text("رابط_الوسائط");
  const mediaValid = mediaUrl ? validateMediaUrl(mediaUrl) : null;
  if (mediaUrl && !mediaValid?.ok) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_URL_INVALID, {
        file,
        sheet,
        row: rowNumber,
        column: "رابط_الوسائط",
      }),
    );
  }
  const mediaType =
    text("نوع_الوسائط") ||
    (mediaValid?.ok ? inferMediaType(mediaValid.url) ?? "" : "");
  if (mediaUrl && !mediaType) {
    issues.push(
      issue(QB_IMPORT_CODES.MEDIA_TYPE_REQUIRED, {
        file,
        sheet,
        row: rowNumber,
        column: "نوع_الوسائط",
      }),
    );
  }
  if (mediaType === "image" && mediaUrl && !text("نص_بديل")) {
    issues.push(
      issue(QB_IMPORT_CODES.MISSING_VALUE, {
        file,
        sheet,
        row: rowNumber,
        column: "نص_بديل",
      }),
    );
  }

  if (issues.some((i) => i.row_blocking)) return { row: null, issues };

  const targets: OfficialNormalizedV1["targets"] = lesson_code
    ? mapped![0] === "LONG_TEXT"
      ? [
          { target_type: "SUBJECT", target_code: subject_code, is_primary: true },
          { target_type: "LESSON", target_code: lesson_code, is_primary: false },
        ]
      : [
          { target_type: "SUBJECT", target_code: subject_code, is_primary: false },
          { target_type: "LESSON", target_code: lesson_code, is_primary: true },
        ]
    : [{ target_type: "SUBJECT", target_code: subject_code, is_primary: true }];

  return {
    row: emptyNormalized({
      question_code,
      revision: {
        status: "DRAFT",
        interaction_type: mapped![0],
        grading_mode: mapped![1],
        question_text,
        stimulus_text: null,
        max_score: score!,
        allow_partial: allowPartial!,
      },
      options,
      accepted_answers: deduped.map((answer_text, sort_order) => ({
        answer_text,
        normalized_answer: answer_text.toLowerCase(),
        sort_order,
      })),
      solutions: text("الشرح") ? [{ body: text("الشرح") }] : [],
      media:
        mediaValid?.ok && mediaType
          ? [
              {
                url: mediaValid.url,
                media_type: mediaType,
                alt_text: text("نص_بديل") || null,
              },
            ]
          : [],
      targets,
      provenance: {
        source_contract: TEACHER_FLAT_AR_V0,
        source_row: rowNumber,
      },
    }),
    issues,
  };
}
