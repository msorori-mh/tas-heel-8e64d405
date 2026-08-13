#!/usr/bin/env node
/**
 * CONTENT_IMPORT_OPERATIONAL_E2E_07 — fixture generator.
 *
 * Writes the Excel workbooks used by the operational E2E run into
 * tests/e2e/content-import/fixtures/. Every domain code is prefixed with
 * `e2e-` so the run stays isolated and can be torn down exactly.
 *
 * Pure file generation — no database access.
 */

import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "tests", "e2e", "content-import", "fixtures");

export const E2E_PREFIX = "e2e-";
export const E2E_SUBJECT_CODE = "e2e-sub-01";
export const E2E_UNIT_CODE = "e2e-unit-01";
export const E2E_LESSON_A = "e2e-lesson-01";
export const E2E_LESSON_B = "e2e-lesson-02";
export const E2E_EXPLANATION_CODE = "e2e-exp-01";
export const E2E_RESOURCE_CODE = "e2e-res-01";
export const E2E_ASSESSMENT_CODE = "e2e-asm-01";
export const E2E_GRADE_SLUG = "grade-12";
export const E2E_TRACK_CODE = "aden";

/**
 * Bank questions the harness seeds directly against the e2e lesson.
 * Template 09 is not importable, so the bank side is prepared out-of-band.
 */
export const E2E_QUESTION_CODES = ["e2e-q-01", "e2e-q-02"];

function sheet(name, columns, rows) {
  return { name, columns, rows };
}

export const FIXTURE_SHEETS = {
  "01_subjects.xlsx": sheet(
    "subjects",
    ["subject_code", "name", "grade_slug", "track_code", "semester", "icon", "color", "sort_order"],
    [
      [E2E_SUBJECT_CODE, "مادة اختبار E2E", E2E_GRADE_SLUG, E2E_TRACK_CODE, 1, "book", "#3B82F6", 900],
    ],
  ),
  "02_units.xlsx": sheet(
    "units",
    ["unit_code", "subject_code", "title", "description", "semester", "is_free", "sort_order"],
    [[E2E_UNIT_CODE, E2E_SUBJECT_CODE, "وحدة اختبار E2E", "وصف الوحدة", 1, "false", 1]],
  ),
  "03_lessons.xlsx": sheet(
    "lessons",
    ["lesson_code", "subject_code", "unit_code", "title", "duration", "semester", "is_free", "sort_order"],
    [
      [E2E_LESSON_A, E2E_SUBJECT_CODE, E2E_UNIT_CODE, "درس اختبار داخل وحدة", "10 دقائق", 1, "false", 1],
      // unit-less lesson — contract requires E2E coverage of the nullable unit_id path
      [E2E_LESSON_B, E2E_SUBJECT_CODE, "", "درس اختبار بدون وحدة", "8 دقائق", 1, "false", 2],
    ],
  ),
  "04_book_contents.xlsx": sheet(
    "book_contents",
    ["subject_code", "lesson_code", "content", "pdf_url"],
    [[E2E_SUBJECT_CODE, E2E_LESSON_A, "## محتوى كتاب الاختبار\n\nفقرة تجريبية.", ""]],
  ),
  "05_explanations.xlsx": sheet(
    "explanations",
    ["subject_code", "lesson_code", "explanation_code", "title", "content", "sort_order"],
    [[E2E_SUBJECT_CODE, E2E_LESSON_A, E2E_EXPLANATION_CODE, "شرح تجريبي", "نص الشرح التجريبي.", 1]],
  ),
  "06_resources.xlsx": sheet(
    "resources",
    [
      "subject_code",
      "lesson_code",
      "resource_code",
      "resource_type",
      "title",
      "description",
      "resource_url",
      "sort_order",
    ],
    [
      [
        E2E_SUBJECT_CODE,
        E2E_LESSON_A,
        E2E_RESOURCE_CODE,
        "link",
        "مورد تجريبي",
        "رابط خارجي للاختبار",
        "https://example.org/e2e-resource",
        1,
      ],
    ],
  ),
  "07_assessments.xlsx": sheet(
    "assessments",
    ["assessment_code", "subject_code", "lesson_code", "title", "instructions", "sort_order"],
    [[E2E_ASSESSMENT_CODE, E2E_SUBJECT_CODE, E2E_LESSON_A, "تقييم تجريبي", "أجب عن الأسئلة.", 1]],
  ),
  "08_assessment_questions.xlsx": sheet(
    "assessment_questions",
    ["assessment_code", "question_code", "sort_order", "points"],
    E2E_QUESTION_CODES.map((code, i) => [E2E_ASSESSMENT_CODE, code, i + 1, 1]),
  ),

  // --- negative fixtures ---------------------------------------------------
  /** Missing the required `name` column + unknown grade reference. */
  "90_invalid_subjects.xlsx": sheet(
    "subjects",
    ["subject_code", "grade_slug", "track_code"],
    [["e2e-sub-invalid", "grade-does-not-exist", E2E_TRACK_CODE]],
  ),
  /** Same natural key as 01 with different content — used against a published row. */
  "91_published_mutation_subjects.xlsx": sheet(
    "subjects",
    ["subject_code", "name", "grade_slug", "track_code", "semester", "icon", "color", "sort_order"],
    [
      [
        E2E_SUBJECT_CODE,
        "مادة اختبار E2E — محاولة تعديل بعد النشر",
        E2E_GRADE_SLUG,
        E2E_TRACK_CODE,
        1,
        "book",
        "#EF4444",
        901,
      ],
    ],
  ),
  /** Template 09 — must be refused as SAFE_BLOCKED. */
  "09_questions.xlsx": sheet(
    "questions",
    ["question_code", "subject_code", "lesson_code", "question_text", "option_1", "option_2", "correct_index"],
    [["e2e-q-blocked-01", E2E_SUBJECT_CODE, E2E_LESSON_A, "سؤال تجريبي؟", "خيار أ", "خيار ب", 1]],
  ),
};

async function writeWorkbook(filename, spec) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.name);
  ws.addRow(spec.columns);
  for (const row of spec.rows) ws.addRow(row);
  await wb.xlsx.writeFile(join(OUT_DIR, filename));
}

export async function generateE2eFixtures() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [filename, spec] of Object.entries(FIXTURE_SHEETS)) {
    await writeWorkbook(filename, spec);
  }
  return { outDir: OUT_DIR, files: Object.keys(FIXTURE_SHEETS) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outDir, files } = await generateE2eFixtures();
  console.log(`wrote ${files.length} fixtures → ${outDir}`);
  for (const f of files) console.log(`  - ${f}`);
}
