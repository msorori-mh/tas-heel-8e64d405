import {
  CONTENT_IMPORT_MAX_ROWS,
  CONTENT_IMPORT_PREVIEW_ROWS,
  CONTENT_IMPORT_RESOURCE_TYPES,
  type ContentImportDryRunIssue,
  type ContentImportDryRunReport,
  type ContentImportDryRunStatus,
  type ContentImportParsedSheet,
} from "./content-import-types.ts";
import {
  CONTENT_IMPORT_TEMPLATE_KEYS,
  getContentImportDryRunConfig,
  type ContentImportTemplateKey,
} from "./content-import-templates.ts";
import { getSubjectMainCategory } from "../subjects/subject-grouping.ts";
import { TCS1_TRACKS } from "../content-codes/tcs1-master-data.ts";
import { isLegacyTcs1Code, LEGACY_CODE_REJECTION_AR } from "../content-codes/tcs2.ts";

const ALLOWED_TRACK_CODES = new Set(TCS1_TRACKS.map((t) => t.trackCode));

/** Columns that carry a system-owned content code (TCS-2). */
const CONTENT_CODE_COLUMNS = [
  "subject_code",
  "unit_code",
  "lesson_code",
  "explanation_code",
  "resource_code",
  "assessment_code",
  "question_code",
] as const;

/** 13C rule 6 — TCS-1 codes (with the track inside) are frozen and rejected. */
function validateNoLegacyCodes(
  rowNumber: number,
  data: Record<string, string>,
  errors: ContentImportDryRunIssue[],
): void {
  for (const column of CONTENT_CODE_COLUMNS) {
    const value = data[column]?.trim();
    if (!value || !isLegacyTcs1Code(value)) continue;
    pushError(errors, {
      rowNumber,
      column,
      code: "LEGACY_CODE_SCHEME_NOT_ALLOWED",
      message: `${LEGACY_CODE_REJECTION_AR} (الكود: ${value})`,
    });
  }
}

/** SHARED_SUBJECT — track_codes is an availability list, not part of identity. */
function validateSubjectTrackCodes(
  rowNumber: number,
  data: Record<string, string>,
  errors: ContentImportDryRunIssue[],
): void {
  if ("track_code" in data && (data["track_code"] ?? "").trim()) {
    pushError(errors, {
      rowNumber,
      column: "track_code",
      code: "TRACK_CODE_COLUMN_REMOVED",
      message:
        "العمود track_code لم يعد مستخدماً. استخدم track_codes واكتب المسارات مفصولة بـ | (مثال: sanaa|aden).",
    });
  }

  const raw = (data["track_codes"] ?? "").trim();
  if (!raw) {
    pushError(errors, {
      rowNumber,
      column: "track_codes",
      code: "TRACK_CODES_REQUIRED",
      message: "يجب تحديد مسار واحد على الأقل في track_codes (مثال: sanaa|aden).",
    });
    return;
  }

  const parts = raw
    .split(/[|,،]/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set<string>();
  for (const part of parts) {
    if (!ALLOWED_TRACK_CODES.has(part)) {
      pushError(errors, {
        rowNumber,
        column: "track_codes",
        code: "UNKNOWN_TRACK_CODE",
        message: `المسار «${part}» غير معروف. المسارات المعتمدة: ${[...ALLOWED_TRACK_CODES].join(" | ")}.`,
      });
      continue;
    }
    if (seen.has(part)) {
      pushError(errors, {
        rowNumber,
        column: "track_codes",
        code: "DUPLICATE_TRACK_CODE",
        message: `المسار «${part}» مكرر في نفس الصف.`,
      });
    }
    seen.add(part);
  }
}

const INSTRUCTION_SHEET_NAMES = new Set(["تعليمات", "instructions", "readme"]);

export function normalizeContentImportHeader(label: string): string {
  return label
    .replace(/\s*\*\s*$/, "")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase();
}

export function cellToImportString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && "result" in (value as object)) {
    return cellToImportString((value as { result: unknown }).result);
  }
  return String(value).trim();
}

export function isInstructionSheetName(name: string): boolean {
  return INSTRUCTION_SHEET_NAMES.has(name.trim().toLowerCase());
}

export function isRowEmpty(data: Record<string, string>): boolean {
  return Object.values(data).every((v) => v === "");
}

function pushError(errors: ContentImportDryRunIssue[], issue: ContentImportDryRunIssue): void {
  errors.push(issue);
}

function pushWarning(warnings: ContentImportDryRunIssue[], issue: ContentImportDryRunIssue): void {
  warnings.push(issue);
}

function validateChoiceQuestionRow(
  rowNumber: number,
  data: Record<string, string>,
  errors: ContentImportDryRunIssue[],
): void {
  const options: Array<{ key: string; index: number }> = [
    { key: "option_1", index: 1 },
    { key: "option_2", index: 2 },
    { key: "option_3", index: 3 },
    { key: "option_4", index: 4 },
    { key: "option_5", index: 5 },
    { key: "option_6", index: 6 },
  ];

  for (const opt of options.slice(0, 2)) {
    if (!data[opt.key]) {
      pushError(errors, {
        rowNumber,
        column: opt.key,
        code: "MISSING_OPTION",
        message: `الحقل ${opt.key} مطلوب.`,
      });
    }
  }

  const rawIndex = data.correct_index;
  if (!rawIndex) {
    pushError(errors, {
      rowNumber,
      column: "correct_index",
      code: "MISSING_CORRECT_INDEX",
      message: "correct_index مطلوب.",
    });
    return;
  }

  const indexNum = Number(rawIndex);
  if (!Number.isFinite(indexNum) || !Number.isInteger(indexNum)) {
    pushError(errors, {
      rowNumber,
      column: "correct_index",
      code: "INVALID_CORRECT_INDEX",
      message: "correct_index يجب أن يكون رقماً صحيحاً (1–6).",
    });
    return;
  }

  if (indexNum < 1 || indexNum > 6) {
    pushError(errors, {
      rowNumber,
      column: "correct_index",
      code: "INVALID_CORRECT_INDEX",
      message: "correct_index يجب أن يكون بين 1 و 6.",
    });
    return;
  }

  const target = options[indexNum - 1];
  if (!target || !data[target.key]) {
    pushError(errors, {
      rowNumber,
      column: "correct_index",
      code: "CORRECT_INDEX_NO_OPTION",
      message: `correct_index=${indexNum} يشير إلى ${target?.key ?? "option"} فارغ.`,
    });
  }
}

function validateOfficialBookQuestionRow(
  rowNumber: number,
  data: Record<string, string>,
  errors: ContentImportDryRunIssue[],
): void {
  const interaction = data.interaction_type?.trim().toUpperCase();
  const grading = data.grading_mode?.trim().toUpperCase();
  const compatible =
    (interaction === "SINGLE_CHOICE" && grading === "AUTO_SINGLE") ||
    (interaction === "SHORT_TEXT" && grading === "AUTO_TEXT") ||
    (interaction === "LONG_TEXT" && grading === "MANUAL");

  if (!compatible) {
    pushError(errors, {
      rowNumber,
      column: "grading_mode",
      code: "INCOMPATIBLE_TYPE_MODE",
      message:
        "الأنواع المسموحة: SINGLE_CHOICE/AUTO_SINGLE أو SHORT_TEXT/AUTO_TEXT أو LONG_TEXT/MANUAL.",
    });
    return;
  }

  if (interaction === "SINGLE_CHOICE") {
    validateChoiceQuestionRow(rowNumber, data, errors);
    return;
  }

  const hasOptions = [1, 2, 3, 4, 5, 6].some((index) => Boolean(data[`option_${index}`]?.trim()));
  if (hasOptions || data.correct_index?.trim()) {
    pushError(errors, {
      rowNumber,
      column: hasOptions ? "option_1" : "correct_index",
      code: "ANSWER_NOT_ALLOWED",
      message: "الخيارات وcorrect_index مسموحة فقط لسؤال SINGLE_CHOICE.",
    });
  }

  if (interaction === "SHORT_TEXT" && !data.accepted_answers?.trim()) {
    pushError(errors, {
      rowNumber,
      column: "accepted_answers",
      code: "ACCEPTED_ANSWER_REQUIRED",
      message: "accepted_answers مطلوبة لسؤال SHORT_TEXT.",
    });
  }
}

function validateResourceRow(
  rowNumber: number,
  data: Record<string, string>,
  errors: ContentImportDryRunIssue[],
): void {
  const type = data.resource_type.trim().toLowerCase();
  if (!type) return;
  if (
    !CONTENT_IMPORT_RESOURCE_TYPES.includes(type as (typeof CONTENT_IMPORT_RESOURCE_TYPES)[number])
  ) {
    pushError(errors, {
      rowNumber,
      column: "resource_type",
      code: "INVALID_RESOURCE_TYPE",
      message: `resource_type «${data.resource_type}» غير مدعوم. القيم: ${CONTENT_IMPORT_RESOURCE_TYPES.join(" | ")}.`,
    });
  }
}

/** Non-standard dash variants that must be normalized to " - ". */
const NONSTANDARD_SUBJECT_DASH = /[‐‑‒–—―−]/;

/**
 * Subject grouping naming checks (docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md).
 * Warnings only — a naming issue never blocks the dry-run unless it clearly
 * breaks grouping. The approved convention is:
 *   "<main subject> - <sub-section>" with a space-hyphen-space separator.
 */
function validateSubjectGroupingNames(
  rows: ContentImportParsedSheet["rows"],
  warnings: ContentImportDryRunIssue[],
): void {
  const parentFirstRow = new Map<string, number>();

  for (const row of rows) {
    const name = row.data.name?.trim();
    if (!name) continue;

    if (NONSTANDARD_SUBJECT_DASH.test(name)) {
      pushWarning(warnings, {
        rowNumber: row.rowNumber,
        column: "name",
        code: "NONSTANDARD_SEPARATOR",
        message: `الفاصل في «${name}» غير موحد. المعتمد: " - " (مسافة + شرطة + مسافة) — حوّل الشرطات من نوع – — − إلى "-".`,
      });
    }

    const parent = getSubjectMainCategory(name);
    if (parent === "الإسلامية") {
      pushWarning(warnings, {
        rowNumber: row.rowNumber,
        column: "name",
        code: "NONSTANDARD_PARENT_SPELLING",
        message: `المعتمد دائماً «التربية الإسلامية - اسم القسم» وليس «الإسلامية - ...»: راجع «${name}».`,
      });
    }

    if (!parentFirstRow.has(parent)) parentFirstRow.set(parent, row.rowNumber);
  }

  // Different parent spellings of the same family (one name contains the
  // other, e.g. "الإسلامية" vs "التربية الإسلامية") split one subject into
  // two groups in the student UI — warn once per mismatched pair.
  const parents = [...parentFirstRow.keys()];
  const reported = new Set<string>();
  for (let i = 0; i < parents.length; i++) {
    for (let j = i + 1; j < parents.length; j++) {
      const a = parents[i];
      const b = parents[j];
      if (a === b) continue;
      if (!a.includes(b) && !b.includes(a)) continue;
      const pairKey = [a, b].sort().join("::");
      if (reported.has(pairKey)) continue;
      reported.add(pairKey);
      pushWarning(warnings, {
        rowNumber: parentFirstRow.get(b) ?? null,
        column: "name",
        code: "PARENT_SPELLING_MISMATCH",
        message: `هجاءان مختلفان لنفس المادة الكبرى: «${a}» (صف ${parentFirstRow.get(a)}) و«${b}» (صف ${parentFirstRow.get(b)}) — وحّد الاسم الكبير حرفياً وإلا ظهرت كمادتين منفصلتين للطالب.`,
      });
    }
  }
}

/**
 * SUBJECT_AS_BRANCH guard (mirrors the DB trigger assert_subject_group_name_consistent):
 * inside the same grade + track + group_code, group_name must be identical.
 * Fail-closed at dry-run so the operator fixes the sheet before execution.
 */
function validateSubjectGroupCodeConsistency(
  rows: ContentImportParsedSheet["rows"],
  errors: ContentImportDryRunIssue[],
  rowNumbersWithErrors: Set<number>,
): void {
  const firstSeen = new Map<string, { rowNumber: number; groupName: string }>();
  for (const row of rows) {
    const groupCode = row.data["group_code"]?.trim().toLowerCase() ?? "";
    if (!groupCode) continue;
    const groupName = row.data["group_name"]?.trim() ?? "";
    if (!groupName) {
      pushError(errors, {
        rowNumber: row.rowNumber,
        column: "group_name",
        code: "GROUP_NAME_REQUIRED",
        message: "عند تعبئة group_code يجب تعبئة group_name أيضاً.",
      });
      rowNumbersWithErrors.add(row.rowNumber);
      continue;
    }
    const scope = [row.data["grade_slug"]?.trim().toLowerCase() ?? "", groupCode].join("::");
    const first = firstSeen.get(scope);
    if (!first) {
      firstSeen.set(scope, { rowNumber: row.rowNumber, groupName });
      continue;
    }
    if (first.groupName !== groupName) {
      pushError(errors, {
        rowNumber: row.rowNumber,
        column: "group_name",
        code: "GROUP_NAME_CONFLICT",
        message: `اسم المجموعة «${groupName}» يخالف «${first.groupName}» المستخدم لنفس كود المجموعة «${groupCode}» (أول ظهور: صف ${first.rowNumber}).`,
      });
      rowNumbersWithErrors.add(row.rowNumber);
    }
  }
}

function duplicateKeyForRow(
  templateKey: ContentImportTemplateKey,
  data: Record<string, string>,
): string | null {
  const config = getContentImportDryRunConfig(templateKey);
  if (config.compositeDuplicateKeys) {
    const parts = config.compositeDuplicateKeys.map((k) => data[k]?.trim() ?? "");
    if (parts.some((p) => !p)) return null;
    return parts.join("::").toLowerCase();
  }
  if (!config.duplicateKeyColumn) return null;
  const value = data[config.duplicateKeyColumn]?.trim();
  return value ? value.toLowerCase() : null;
}

export function validateContentImportSheet(
  templateKey: ContentImportTemplateKey,
  parsed: ContentImportParsedSheet,
): ContentImportDryRunReport {
  const config = getContentImportDryRunConfig(templateKey);
  const errors: ContentImportDryRunIssue[] = [];
  const warnings: ContentImportDryRunIssue[] = [];

  const normalizedHeaders = parsed.detectedColumns.map(normalizeContentImportHeader);
  const presentSet = new Set(normalizedHeaders);

  for (const col of config.requiredColumns) {
    if (!presentSet.has(col)) {
      pushError(errors, {
        rowNumber: null,
        column: col,
        code: "MISSING_COLUMN",
        message: `العمود المطلوب «${col}» غير موجود في الملف.`,
      });
    }
  }

  for (const header of normalizedHeaders) {
    if (!config.knownColumns.includes(header)) {
      pushWarning(warnings, {
        rowNumber: null,
        column: header,
        code: "EXTRA_COLUMN",
        message: `عمود إضافي غير متوقع في القالب: «${header}».`,
      });
    }
  }

  if (parsed.rows.length === 0 && errors.length === 0) {
    pushError(errors, {
      rowNumber: null,
      column: null,
      code: "EMPTY_FILE",
      message: "لا توجد صفوف بيانات بعد تجاهل الصفوف الفارغة.",
    });
  }

  if (parsed.rows.length > CONTENT_IMPORT_MAX_ROWS) {
    pushError(errors, {
      rowNumber: null,
      column: null,
      code: "ROW_LIMIT",
      message: `عدد الصفوف (${parsed.rows.length}) يتجاوز الحد الأقصى (${CONTENT_IMPORT_MAX_ROWS}).`,
    });
  }

  for (const info of config.infoWarnings) {
    pushWarning(warnings, {
      rowNumber: null,
      column: null,
      code: "INFO",
      message: info,
    });
  }

  const seenDuplicates = new Map<string, number>();
  const rowNumbersWithErrors = new Set<number>();

  for (const row of parsed.rows) {
    for (const col of config.requiredColumns) {
      if (!row.data[col]?.trim()) {
        pushError(errors, {
          rowNumber: row.rowNumber,
          column: col,
          code: "MISSING_VALUE",
          message: `الحقل «${col}» مطلوب ولا يمكن أن يكون فارغاً.`,
        });
        rowNumbersWithErrors.add(row.rowNumber);
      }
    }

    const dupKey = duplicateKeyForRow(templateKey, row.data);
    if (dupKey) {
      const first = seenDuplicates.get(dupKey);
      if (first != null) {
        pushError(errors, {
          rowNumber: row.rowNumber,
          column: config.duplicateKeyColumn ?? config.compositeDuplicateKeys?.join("+") ?? null,
          code: "DUPLICATE_KEY",
          message: `قيمة مكررة «${dupKey}» (أول ظهور: صف ${first}).`,
        });
        rowNumbersWithErrors.add(row.rowNumber);
      } else {
        seenDuplicates.set(dupKey, row.rowNumber);
      }
    }

    validateNoLegacyCodes(row.rowNumber, row.data, errors);

    if (templateKey === "subjects") {
      validateSubjectTrackCodes(row.rowNumber, row.data, errors);
    }

    if (templateKey === "resources") {
      validateResourceRow(row.rowNumber, row.data, errors);
      if (errors.some((e) => e.rowNumber === row.rowNumber)) {
        rowNumbersWithErrors.add(row.rowNumber);
      }
    }

    if (templateKey === "questions") {
      validateOfficialBookQuestionRow(row.rowNumber, row.data, errors);
    }

    if (templateKey === "self_test_questions") {
      validateChoiceQuestionRow(row.rowNumber, row.data, errors);
    }

    if (errors.some((e) => e.rowNumber === row.rowNumber)) {
      rowNumbersWithErrors.add(row.rowNumber);
    }
  }

  if (templateKey === "subjects") {
    validateSubjectGroupingNames(parsed.rows, warnings);
    validateSubjectGroupCodeConsistency(parsed.rows, errors, rowNumbersWithErrors);
  }

  const hasFileLevelError = errors.some((e) => e.rowNumber == null);
  const invalidRows = hasFileLevelError ? parsed.rows.length : rowNumbersWithErrors.size;
  const validRows = Math.max(0, parsed.rows.length - invalidRows);

  let status: ContentImportDryRunStatus = "pass";
  if (errors.length > 0) status = "fail";
  else if (warnings.length > 0) status = "warn";

  const previewRows = parsed.rows.slice(0, CONTENT_IMPORT_PREVIEW_ROWS).map((r) => ({ ...r.data }));

  return {
    ok: status !== "fail",
    status,
    templateKey,
    filename: parsed.fileName,
    totalRows: parsed.rows.length,
    validRows,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    previewRows,
    detectedColumns: [
      ...config.knownColumns.filter((c) => presentSet.has(c)),
      ...normalizedHeaders.filter((h) => !config.knownColumns.includes(h)),
    ],
  };
}

export function assertAllowedContentImportTemplateKey(key: string): ContentImportTemplateKey {
  if (!CONTENT_IMPORT_TEMPLATE_KEYS.includes(key as ContentImportTemplateKey)) {
    throw new Error("غير مصرح — نوع القالب غير مدعوم. يُقبل قوالب محتوى الدروس 01–09 فقط.");
  }
  return key as ContentImportTemplateKey;
}
