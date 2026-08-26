#!/usr/bin/env node
/**
 * CONTENT-IMPORT-LOCAL-PREFLIGHT-VALIDATOR-01
 *
 * Local, offline preflight check for a content package directory BEFORE any
 * upload or server dry-run. Read-only: parses xlsx files, never touches the
 * network, the database, or any production system. No import is performed.
 *
 * Usage:
 *   node scripts/content-import/validate-content-package.mjs <content-dir>
 *   npm run content:preflight -- <content-dir>
 *
 * Exit code 0 = no blocking errors (warnings allowed), 1 = blocking errors.
 *
 * Naming rules mirror the server dry-run (src/lib/content-import) and reuse
 * the grouping helpers from src/lib/subjects/subject-grouping.ts as the
 * single source of truth.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { getSubjectMainCategory } from "../../src/lib/subjects/subject-grouping.ts";

const TEMPLATES = [
  {
    prefix: "01",
    key: "subjects",
    file: "01_subjects_template.xlsx",
    label: "المواد",
    required: ["subject_code", "name", "grade_slug"],
    codeColumn: "subject_code",
  },
  {
    prefix: "02",
    key: "units",
    file: "02_units_template.xlsx",
    label: "الوحدات",
    required: ["unit_code", "subject_code", "title"],
    codeColumn: "unit_code",
  },
  {
    prefix: "03",
    key: "lessons",
    file: "03_lessons_template.xlsx",
    label: "الدروس",
    required: ["lesson_code", "subject_code", "title"],
    codeColumn: "lesson_code",
  },
  {
    prefix: "04",
    key: "book_contents",
    file: "04_lesson_book_contents_template.xlsx",
    label: "محتوى الكتاب",
    required: ["lesson_code", "content"],
  },
  {
    prefix: "05",
    key: "explanations",
    file: "05_lesson_explanations_template.xlsx",
    label: "الشروحات",
    required: ["lesson_code", "title", "content"],
  },
  {
    prefix: "06",
    key: "resources",
    file: "06_lesson_resources_template.xlsx",
    label: "الموارد",
    required: ["lesson_code", "resource_type", "title"],
  },
  {
    prefix: "07",
    key: "assessments",
    file: "07_lesson_assessments_template.xlsx",
    label: "تقييمات الدروس",
    required: ["assessment_code", "lesson_code", "title"],
    codeColumn: "assessment_code",
  },
  {
    prefix: "08",
    key: "assessment_questions",
    file: "08_assessment_questions_template.xlsx",
    label: "أسئلة التقييمات",
    required: ["assessment_code", "question_code"],
  },
  {
    prefix: "09",
    key: "questions",
    file: "09_official_book_questions_template.xlsx",
    label: "أسئلة الكتاب الأصلية",
    required: [
      "question_code",
      "subject_code",
      "lesson_code",
      "prompt_kind",
      "question_text",
      "interaction_type",
      "grading_mode",
      "model_answer",
    ],
    codeColumn: "question_code",
  },
  {
    prefix: "10",
    key: "self_test_questions",
    file: "10_self_test_questions_template.xlsx",
    label: "اختبر فهمك",
    required: [
      "question_code",
      "subject_code",
      "lesson_code",
      "question_text",
      "option_1",
      "option_2",
      "correct_index",
      "explanation",
    ],
    codeColumn: "question_code",
  },
];

const RESOURCE_TYPES = ["video", "mindmap", "experiment", "pdf", "link"];
const INSTRUCTION_SHEETS = new Set(["تعليمات", "instructions", "readme"]);
const NONSTANDARD_DASH = /[‐‑‒–—―−]/;

function normalizeHeader(label) {
  return String(label ?? "")
    .replace(/\s*\*\s*$/, "")
    .trim()
    .replace(/[ً-ٰٟ]/g, "")
    .toLowerCase();
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("result" in value) return cellText(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((r) => r.text ?? "")
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

async function parseTemplateFile(path) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet =
    workbook.worksheets.find((s) => !INSTRUCTION_SHEETS.has(s.name.trim().toLowerCase())) ??
    workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerMap = new Map();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const h = normalizeHeader(cellText(cell.value));
    if (h) headerMap.set(colNumber, h);
  });

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const data = {};
    headerMap.forEach((header, colNumber) => {
      data[header] = cellText(row.getCell(colNumber).value);
    });
    if (Object.values(data).every((v) => v === "")) return;
    rows.push({ rowNumber, data });
  });

  return { headers: [...new Set(headerMap.values())], rows };
}

function issue(list, file, rowNumber, code, message) {
  list.push({ file, rowNumber: rowNumber ?? null, code, message });
}

/**
 * Validates a content package directory.
 * @returns {Promise<{ok: boolean, errors: object[], warnings: object[], found: string[], missing: string[]}>}
 */
export async function validateContentPackage(dir) {
  const errors = [];
  const warnings = [];

  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    issue(
      errors,
      String(dir),
      null,
      "DIR_NOT_FOUND",
      `المجلد غير موجود أو غير قابل للقراءة: ${dir}`,
    );
    return { ok: false, errors, warnings, found: [], missing: TEMPLATES.map((t) => t.file) };
  }

  const xlsxFiles = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".xlsx"));

  // --- map files to templates by numeric prefix ---
  const filesByTemplate = new Map();
  for (const file of xlsxFiles) {
    const template = TEMPLATES.find((t) => file.name.startsWith(t.prefix + "_"));
    if (!template) {
      issue(
        warnings,
        file.name,
        null,
        "EXTRA_FILE",
        `ملف غير متوقع لا يتبع تسمية القوالب 01–09: «${file.name}».`,
      );
      continue;
    }
    if (filesByTemplate.has(template.key)) {
      issue(
        errors,
        file.name,
        null,
        "DUPLICATE_TEMPLATE_FILE",
        `أكثر من ملف للقالب ${template.prefix} (${template.label}).`,
      );
      continue;
    }
    filesByTemplate.set(template.key, file.name);
  }

  const missing = TEMPLATES.filter((t) => !filesByTemplate.has(t.key)).map((t) => t.file);
  for (const t of TEMPLATES.filter((t) => !filesByTemplate.has(t.key))) {
    issue(
      errors,
      t.file,
      null,
      "FILE_MISSING",
      `الملف المطلوب «${t.file}» (${t.label}) غير موجود في المجلد.`,
    );
  }

  // --- parse present files ---
  const parsed = new Map();
  for (const t of TEMPLATES) {
    const fileName = filesByTemplate.get(t.key);
    if (!fileName) continue;
    try {
      parsed.set(t.key, await parseTemplateFile(join(dir, fileName)));
    } catch (e) {
      issue(errors, fileName, null, "PARSE_ERROR", `تعذّر قراءة الملف كـ xlsx: ${e.message}`);
    }
  }

  const codes = new Map(); // templateKey -> Set of codes
  const getRows = (key) => parsed.get(key)?.rows ?? [];
  const codeSet = (key) => codes.get(key) ?? new Set();

  for (const t of TEMPLATES) {
    const fileName = filesByTemplate.get(t.key);
    const p = parsed.get(t.key);
    if (!fileName || !p) continue;

    for (const col of t.required) {
      if (!p.headers.includes(col)) {
        issue(
          errors,
          fileName,
          null,
          "MISSING_COLUMN",
          `العمود المطلوب «${col}» غير موجود في «${fileName}».`,
        );
      }
    }
    if (p.rows.length === 0) {
      issue(errors, fileName, null, "EMPTY_FILE", `لا توجد صفوف بيانات في «${fileName}».`);
    }

    const set = new Set();
    for (const row of p.rows) {
      for (const col of t.required) {
        if (!row.data[col]?.trim()) {
          issue(
            errors,
            fileName,
            row.rowNumber,
            "MISSING_VALUE",
            `الحقل «${col}» مطلوب ولا يمكن أن يكون فارغاً (صف ${row.rowNumber}).`,
          );
        }
      }
      if (t.codeColumn) {
        const code = row.data[t.codeColumn]?.trim().toLowerCase();
        if (code) {
          if (set.has(code)) {
            issue(
              errors,
              fileName,
              row.rowNumber,
              "DUPLICATE_CODE",
              `تكرار ${t.codeColumn} «${code}» — كل كود يجب أن يكون فريداً.`,
            );
          }
          set.add(code);
        }
      }
    }
    if (t.codeColumn) codes.set(t.key, set);
  }

  // --- subjects: naming rules (mirrors server dry-run) ---
  const subjectRows = getRows("subjects");
  const parentFirstRow = new Map();
  for (const row of subjectRows) {
    const name = row.data.name?.trim();
    if (!name) continue;
    const file = filesByTemplate.get("subjects");
    if (NONSTANDARD_DASH.test(name)) {
      issue(
        warnings,
        file,
        row.rowNumber,
        "NONSTANDARD_SEPARATOR",
        `الفاصل في «${name}» غير موحد. المعتمد: " - " (مسافة + شرطة + مسافة).`,
      );
    }
    const parent = getSubjectMainCategory(name);
    if (parent === "الإسلامية") {
      issue(
        warnings,
        file,
        row.rowNumber,
        "NONSTANDARD_PARENT_SPELLING",
        `المعتمد دائماً «التربية الإسلامية - اسم القسم» وليس «الإسلامية - ...»: راجع «${name}».`,
      );
    }
    const gradeSlug = row.data.grade_slug?.trim();
    if (gradeSlug && !/^grade-\d+$/.test(gradeSlug)) {
      issue(
        warnings,
        file,
        row.rowNumber,
        "UNKNOWN_GRADE_SLUG",
        `grade_slug «${gradeSlug}» غير مألوف — القيم المعروفة: grade-10 | grade-11 | grade-12.`,
      );
    }
    if (!parentFirstRow.has(parent)) parentFirstRow.set(parent, row.rowNumber);
  }
  {
    const file = filesByTemplate.get("subjects");
    const parents = [...parentFirstRow.keys()];
    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const a = parents[i];
        const b = parents[j];
        if (a !== b && (a.includes(b) || b.includes(a))) {
          issue(
            warnings,
            file,
            parentFirstRow.get(b),
            "PARENT_SPELLING_MISMATCH",
            `هجاءان مختلفان لنفس المادة الكبرى: «${a}» و«${b}» — وحّد الاسم الكبير حرفياً.`,
          );
        }
      }
    }
  }

  // --- resources / questions field rules ---
  for (const row of getRows("resources")) {
    const type = row.data.resource_type?.trim().toLowerCase();
    if (type && !RESOURCE_TYPES.includes(type)) {
      issue(
        errors,
        filesByTemplate.get("resources"),
        row.rowNumber,
        "INVALID_RESOURCE_TYPE",
        `resource_type «${row.data.resource_type}» غير مدعوم. القيم: ${RESOURCE_TYPES.join(" | ")}.`,
      );
    }
  }
  for (const row of getRows("questions")) {
    const interaction = row.data.interaction_type?.trim().toUpperCase();
    const grading = row.data.grading_mode?.trim().toUpperCase();
    const compatible =
      (interaction === "SINGLE_CHOICE" && grading === "AUTO_SINGLE") ||
      (interaction === "SHORT_TEXT" && grading === "AUTO_TEXT") ||
      (interaction === "LONG_TEXT" && grading === "MANUAL");
    if (!compatible) {
      issue(
        errors,
        filesByTemplate.get("questions"),
        row.rowNumber,
        "INCOMPATIBLE_TYPE_MODE",
        "نوع التفاعل ووضع التصحيح غير متوافقين.",
      );
      continue;
    }
    const hasOptions = [1, 2, 3, 4, 5, 6].some((index) => row.data[`option_${index}`]?.trim());
    if (interaction === "SINGLE_CHOICE") {
      const raw = row.data.correct_index?.trim();
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 6 || !row.data[`option_${n}`]?.trim()) {
        issue(
          errors,
          filesByTemplate.get("questions"),
          row.rowNumber,
          "INVALID_CORRECT_INDEX",
          "سؤال SINGLE_CHOICE يتطلب correct_index صالحاً وخياراً غير فارغ.",
        );
      }
      if ([1, 2, 3, 4, 5, 6].filter((index) => row.data[`option_${index}`]?.trim()).length < 2) {
        issue(
          errors,
          filesByTemplate.get("questions"),
          row.rowNumber,
          "MISSING_OPTION",
          "سؤال SINGLE_CHOICE يتطلب خيارين على الأقل.",
        );
      }
    } else if (hasOptions || row.data.correct_index?.trim()) {
      issue(
        errors,
        filesByTemplate.get("questions"),
        row.rowNumber,
        "ANSWER_NOT_ALLOWED",
        "الخيارات وcorrect_index مسموحة فقط لسؤال SINGLE_CHOICE.",
      );
    }
    if (interaction === "SHORT_TEXT" && !row.data.accepted_answers?.trim()) {
      issue(
        errors,
        filesByTemplate.get("questions"),
        row.rowNumber,
        "ACCEPTED_ANSWER_REQUIRED",
        "accepted_answers مطلوبة لسؤال SHORT_TEXT.",
      );
    }
  }
  for (const row of getRows("self_test_questions")) {
    const raw = row.data.correct_index?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 6) {
      issue(
        errors,
        filesByTemplate.get("self_test_questions"),
        row.rowNumber,
        "INVALID_CORRECT_INDEX",
        `correct_index يجب أن يكون رقماً صحيحاً بين 1 و 6 (القيمة: «${raw}»).`,
      );
      continue;
    }
    if (!row.data[`option_${n}`]?.trim()) {
      issue(
        errors,
        filesByTemplate.get("self_test_questions"),
        row.rowNumber,
        "CORRECT_INDEX_NO_OPTION",
        `correct_index=${n} يشير إلى option_${n} الفارغ.`,
      );
    }
  }

  // --- cross-file linkage (grade → subject → unit → lesson → question → assessment) ---
  const link = (fromKey, fromColumn, toKey, toLabel) => {
    const targets = codeSet(toKey);
    const fromFile = filesByTemplate.get(fromKey);
    if (!fromFile || getRows(fromKey).length === 0) return;
    if (targets.size === 0) {
      if (getRows(fromKey).some((r) => r.data[fromColumn]?.trim())) {
        issue(
          warnings,
          fromFile,
          null,
          "LINK_SKIPPED",
          `تعذّر فحص ربط «${fromColumn}» لغياب/فراغ قالب ${toLabel}.`,
        );
      }
      return;
    }
    for (const row of getRows(fromKey)) {
      const ref = row.data[fromColumn]?.trim().toLowerCase();
      if (ref && !targets.has(ref)) {
        issue(
          errors,
          fromFile,
          row.rowNumber,
          "UNKNOWN_REFERENCE",
          `«${fromColumn}» = «${row.data[fromColumn]}» غير معرّف في قالب ${toLabel}.`,
        );
      }
    }
  };
  link("units", "subject_code", "subjects", "01 المواد");
  link("lessons", "subject_code", "subjects", "01 المواد");
  link("lessons", "unit_code", "units", "02 الوحدات");
  link("book_contents", "lesson_code", "lessons", "03 الدروس");
  link("explanations", "lesson_code", "lessons", "03 الدروس");
  link("resources", "lesson_code", "lessons", "03 الدروس");
  link("assessments", "lesson_code", "lessons", "03 الدروس");
  link("assessment_questions", "assessment_code", "assessments", "07 التقييمات");
  link("assessment_questions", "question_code", "self_test_questions", "10 اختبر فهمك");
  for (const questionKey of ["questions", "self_test_questions"]) {
    for (const row of getRows(questionKey)) {
      const file = filesByTemplate.get(questionKey);
      const lessonRef = row.data.lesson_code?.trim().toLowerCase();
      if (lessonRef && codeSet("lessons").size > 0 && !codeSet("lessons").has(lessonRef)) {
        issue(
          errors,
          file,
          row.rowNumber,
          "UNKNOWN_REFERENCE",
          `lesson_code «${row.data.lesson_code}» غير معرّف في قالب 03 الدروس.`,
        );
      }
      const subjectRef = row.data.subject_code?.trim().toLowerCase();
      if (subjectRef && codeSet("subjects").size > 0 && !codeSet("subjects").has(subjectRef)) {
        issue(
          errors,
          file,
          row.rowNumber,
          "UNKNOWN_REFERENCE",
          `subject_code «${row.data.subject_code}» غير معرّف في قالب 01 المواد.`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    found: [...filesByTemplate.values()],
    missing,
  };
}

function printReport(dir, report) {
  console.log(`\nفحص حزمة المحتوى: ${dir}`);
  console.log(`الملفات الموجودة: ${report.found.length}/9 — الناقصة: ${report.missing.length}`);
  for (const w of report.warnings) {
    console.log(
      `  ⚠️  [${w.code}] ${w.file}${w.rowNumber ? " صف " + w.rowNumber : ""}: ${w.message}`,
    );
  }
  for (const e of report.errors) {
    console.log(
      `  ❌ [${e.code}] ${e.file}${e.rowNumber ? " صف " + e.rowNumber : ""}: ${e.message}`,
    );
  }
  console.log(
    report.ok
      ? `\nالنتيجة: PASS${report.warnings.length ? " مع تحذيرات — راجعها قبل dry-run" : " — لا أخطاء ولا تحذيرات"}.`
      : `\nالنتيجة: FAIL — ${report.errors.length} خطأ مانع. أصلحها قبل الانتقال إلى dry-run.`,
  );
}

// CLI entry (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error(
      "الاستخدام: node scripts/content-import/validate-content-package.mjs <content-dir>",
    );
    process.exit(2);
  }
  const report = await validateContentPackage(dir);
  printReport(dir, report);
  process.exit(report.ok ? 0 : 1);
}
