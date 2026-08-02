import type { OfficialNormalizedV1, CatalogLookup } from "./official-normalized-v1.ts";
import { NORMALIZATION_POLICIES, QUESTION_TYPES } from "./official-normalized-v1.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { createHash } from "node:crypto";

export function contentFingerprint(row: OfficialNormalizedV1): string {
  const payload = {
    question_text: row.question_text,
    options: row.options.map((o) => ({
      option_code: o.option_code,
      option_text: o.option_text,
      is_correct: o.is_correct,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

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
  const file = ctx.file ?? null;
  const sheet = ctx.sheet ?? null;
  const rowNumber = ctx.rowNumber ?? null;

  if (!QUESTION_TYPES.includes(row.question_type)) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_QUESTION_TYPE, {
        file,
        sheet,
        row: rowNumber,
        column: "question_type",
        suggested_fix: `الأنواع المسموحة: ${QUESTION_TYPES.join(", ")}`,
      }),
    );
  }

  if (
    row.normalization_policy &&
    !NORMALIZATION_POLICIES.includes(row.normalization_policy)
  ) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_UNSUPPORTED_NORMALIZATION, {
        file,
        sheet,
        row: rowNumber,
        column: "normalization_policy",
        suggested_fix: "استخدم EXACT أو TRIM أو TRIM_COLLAPSE فقط.",
      }),
    );
  }

  if (ctx.catalog) {
    if (!ctx.catalog.subjects.has(row.subject_code)) {
      issues.push(
        issue(QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_SUBJECT, {
          file,
          sheet,
          row: rowNumber,
          column: "subject_code",
          suggested_fix: "طابق رمز المادة مع الكتالوج.",
        }),
      );
    }
    if (row.lesson_code && !ctx.catalog.lessons.has(row.lesson_code)) {
      issues.push(
        issue(QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_LESSON, {
          file,
          sheet,
          row: rowNumber,
          column: "lesson_code",
          suggested_fix: "طابق رمز الدرس مع الكتالوج.",
        }),
      );
    }
  }

  if (ctx.seenCodes) {
    if (ctx.seenCodes.has(row.question_code)) {
      issues.push(
        issue(QB_IMPORT_CODES.QB_IMPORT_DUPLICATE_QUESTION_CODE, {
          file,
          sheet,
          row: rowNumber,
          column: "question_code",
          suggested_fix: "اجعل question_code فريداً داخل الملف.",
        }),
      );
    } else {
      ctx.seenCodes.add(row.question_code);
    }
  }

  if (ctx.seenFingerprints) {
    const fp = contentFingerprint(row);
    if (ctx.seenFingerprints.has(fp)) {
      issues.push(
        issue(QB_IMPORT_CODES.QB_IMPORT_DUPLICATE_CONTENT, {
          file,
          sheet,
          row: rowNumber,
          column: "question_text",
          severity: "warning",
          row_blocking: false,
          suggested_fix: "راجع التكرار المحتمل لنفس المحتوى.",
        }),
      );
    } else {
      ctx.seenFingerprints.add(fp);
    }
  }

  return issues;
}
