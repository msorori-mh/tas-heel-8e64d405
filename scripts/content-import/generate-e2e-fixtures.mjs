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
 * Bank questions the harness seeds directly against the e2e lesson (template 08
 * links only; it never creates question content).
 */
export const E2E_QUESTION_CODES = ["e2e-q-01", "e2e-q-02"];

/** Template 09 (phase 08) — imported through the question-bank binding. */
export const E2E_IMPORT_QUESTION_A = "e2e-qi-01";
export const E2E_IMPORT_QUESTION_B = "e2e-qi-02";
export const E2E_IMPORT_QUESTION_C = "e2e-qi-03";
export const E2E_IMPORT_QUESTION_D = "e2e-qi-04";

/**
 * UNIFIED_OPERATIONAL_E2E_09 — codes for the single coherent package that runs
 * every template together. Prefixed with `e2e-u9-` so it never collides with
 * the phase 07/08 fixtures while staying inside the `e2e-` teardown scope.
 */
export const U9 = {
  subject: "e2e-u9-sub",
  unit: "e2e-u9-unit",
  lessonA: "e2e-u9-les-01",
  lessonB: "e2e-u9-les-02",
  lessonBroken: "e2e-u9-les-broken",
  explanation: "e2e-u9-exp-01",
  resourceA: "e2e-u9-res-01",
  resourceB: "e2e-u9-res-02",
  assessment: "e2e-u9-asm-01",
  questionA: "e2e-u9-q-01",
  questionB: "e2e-u9-q-02",
  questionC: "e2e-u9-q-03",
};

const QUESTION_COLUMNS = [
  "question_code",
  "subject_code",
  "lesson_code",
  "question_text",
  "option_1",
  "option_2",
  "correct_index",
  "explanation",
];

function sheet(name, columns, rows) {
  return { name, columns, rows };
}

export const FIXTURE_SHEETS = {
  "01_subjects.xlsx": sheet(
    "subjects",
    ["subject_code", "name", "grade_slug", "track_code", "semester", "icon", "color", "sort_order"],
    [
      [
        E2E_SUBJECT_CODE,
        "مادة اختبار E2E",
        E2E_GRADE_SLUG,
        E2E_TRACK_CODE,
        1,
        "book",
        "#3B82F6",
        900,
      ],
    ],
  ),
  "02_units.xlsx": sheet(
    "units",
    ["unit_code", "subject_code", "title", "description", "semester", "is_free", "sort_order"],
    [[E2E_UNIT_CODE, E2E_SUBJECT_CODE, "وحدة اختبار E2E", "وصف الوحدة", 1, "false", 1]],
  ),
  "03_lessons.xlsx": sheet(
    "lessons",
    [
      "lesson_code",
      "subject_code",
      "unit_code",
      "title",
      "duration",
      "semester",
      "is_free",
      "sort_order",
    ],
    [
      [
        E2E_LESSON_A,
        E2E_SUBJECT_CODE,
        E2E_UNIT_CODE,
        "درس اختبار داخل وحدة",
        "10 دقائق",
        1,
        "false",
        1,
      ],
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
  /** Template 09 — routed to the question bank as DRAFT revisions (phase 08). */
  "09_questions.xlsx": sheet("questions", QUESTION_COLUMNS, [
    [
      E2E_IMPORT_QUESTION_A,
      E2E_SUBJECT_CODE,
      E2E_LESSON_A,
      "سؤال مستورد تجريبي أ؟",
      "خيار أ",
      "خيار ب",
      1,
      "شرح الإجابة أ",
    ],
    [
      E2E_IMPORT_QUESTION_B,
      E2E_SUBJECT_CODE,
      E2E_LESSON_A,
      "سؤال مستورد تجريبي ب؟",
      "خيار 1",
      "خيار 2",
      2,
      "",
    ],
  ]),
  /** Same question content, different target → TARGET_ADDED, zero new revisions. */
  "09b_questions_retarget.xlsx": sheet("questions", QUESTION_COLUMNS, [
    [
      E2E_IMPORT_QUESTION_A,
      E2E_SUBJECT_CODE,
      "",
      "سؤال مستورد تجريبي أ؟",
      "خيار أ",
      "خيار ب",
      1,
      "شرح الإجابة أ",
    ],
  ]),
  /** Changed content for the same question_code → new DRAFT revision. */
  "09c_questions_changed.xlsx": sheet("questions", QUESTION_COLUMNS, [
    [
      E2E_IMPORT_QUESTION_A,
      E2E_SUBJECT_CODE,
      E2E_LESSON_A,
      "سؤال مستورد تجريبي أ — نص معدّل؟",
      "خيار أ",
      "خيار ب",
      1,
      "شرح الإجابة أ",
    ],
  ]),
  /** Third content variant, imported while a revision is already published. */
  "09d_questions_after_publish.xlsx": sheet("questions", QUESTION_COLUMNS, [
    [
      E2E_IMPORT_QUESTION_A,
      E2E_SUBJECT_CODE,
      E2E_LESSON_A,
      "سؤال مستورد تجريبي أ — تعديل بعد النشر؟",
      "خيار أ",
      "خيار ب",
      1,
      "شرح الإجابة أ",
    ],
  ]),
  /** Valid row followed by an unresolvable lesson → whole template rolls back. */
  "92_invalid_questions.xlsx": sheet("questions", QUESTION_COLUMNS, [
    [
      E2E_IMPORT_QUESTION_C,
      E2E_SUBJECT_CODE,
      E2E_LESSON_A,
      "سؤال يجب ألا يُكتب؟",
      "خيار أ",
      "خيار ب",
      1,
      "",
    ],
    [
      E2E_IMPORT_QUESTION_D,
      E2E_SUBJECT_CODE,
      "e2e-lesson-missing",
      "سؤال بمرجع درس مفقود؟",
      "خيار أ",
      "خيار ب",
      2,
      "",
    ],
  ]),

  // --- unified package (phase 09) ------------------------------------------
  ...unifiedPackageSheets(),
};

/**
 * CONTENT_AND_QUESTION_UNIFIED_OPERATIONAL_E2E_09 — one coherent package that
 * exercises every template against a single subject/unit/lesson tree.
 * All codes stay under the `e2e-` prefix so the shared teardown still applies.
 */
function unifiedPackageSheets() {
  const S = U9.subject;
  const L1 = U9.lessonA;
  const L2 = U9.lessonB;
  return {
    "u09_01_subjects.xlsx": sheet(
      "subjects",
      [
        "subject_code",
        "name",
        "grade_slug",
        "track_code",
        "semester",
        "icon",
        "color",
        "sort_order",
      ],
      [[S, "مادة الحزمة الموحّدة", E2E_GRADE_SLUG, E2E_TRACK_CODE, 1, "book", "#0EA5E9", 950]],
    ),
    "u09_02_units.xlsx": sheet(
      "units",
      ["unit_code", "subject_code", "title", "description", "semester", "is_free", "sort_order"],
      [[U9.unit, S, "وحدة الحزمة الموحّدة", "وصف الوحدة", 1, "false", 1]],
    ),
    "u09_03_lessons.xlsx": sheet(
      "lessons",
      [
        "lesson_code",
        "subject_code",
        "unit_code",
        "title",
        "duration",
        "semester",
        "is_free",
        "sort_order",
      ],
      [
        [L1, S, U9.unit, "درس الحزمة الأول", "12 دقيقة", 1, "false", 1],
        [L2, S, U9.unit, "درس الحزمة الثاني", "9 دقائق", 1, "false", 2],
      ],
    ),
    "u09_04_book_contents.xlsx": sheet(
      "book_contents",
      ["subject_code", "lesson_code", "content", "pdf_url"],
      [[S, L1, "## محتوى كتاب الحزمة\n\nفقرة تجريبية موحّدة.", ""]],
    ),
    "u09_05_explanations.xlsx": sheet(
      "explanations",
      ["subject_code", "lesson_code", "explanation_code", "title", "content", "sort_order"],
      [[S, L1, U9.explanation, "شرح الحزمة", "نص شرح الحزمة الموحّدة.", 1]],
    ),
    "u09_06_resources.xlsx": sheet(
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
          S,
          L1,
          U9.resourceA,
          "link",
          "مورد الحزمة الأول",
          "رابط خارجي",
          "https://example.org/u09-a",
          1,
        ],
        [
          S,
          L2,
          U9.resourceB,
          "link",
          "مورد الحزمة الثاني",
          "رابط خارجي",
          "https://example.org/u09-b",
          2,
        ],
      ],
    ),
    "u09_07_assessments.xlsx": sheet(
      "assessments",
      ["assessment_code", "subject_code", "lesson_code", "title", "instructions", "sort_order"],
      [[U9.assessment, S, L1, "تقييم الحزمة", "أجب عن الأسئلة.", 1]],
    ),
    "u09_08_assessment_questions.xlsx": sheet(
      "assessment_questions",
      ["assessment_code", "question_code", "sort_order", "points"],
      [
        [U9.assessment, U9.questionA, 1, 1],
        [U9.assessment, U9.questionB, 2, 1],
      ],
    ),
    "u09_09_questions.xlsx": sheet("questions", QUESTION_COLUMNS, [
      [U9.questionA, S, L1, "سؤال الحزمة أ؟", "خيار أ", "خيار ب", 1, "شرح أ"],
      [U9.questionB, S, L1, "سؤال الحزمة ب؟", "خيار أ", "خيار ب", 2, ""],
      [U9.questionC, S, L2, "سؤال الحزمة ج؟", "خيار أ", "خيار ب", 1, ""],
    ]),

    /** Partial update — only the second lesson changed. */
    "u09_03_lessons_changed.xlsx": sheet(
      "lessons",
      [
        "lesson_code",
        "subject_code",
        "unit_code",
        "title",
        "duration",
        "semester",
        "is_free",
        "sort_order",
      ],
      [
        [L1, S, U9.unit, "درس الحزمة الأول", "12 دقيقة", 1, "false", 1],
        [L2, S, U9.unit, "درس الحزمة الثاني — عنوان معدّل", "9 دقائق", 1, "false", 2],
      ],
    ),
    /** Partial update — only question A content changed. */
    "u09_09_questions_changed.xlsx": sheet("questions", QUESTION_COLUMNS, [
      [U9.questionA, S, L1, "سؤال الحزمة أ — نص معدّل؟", "خيار أ", "خيار ب", 1, "شرح أ"],
      [U9.questionB, S, L1, "سؤال الحزمة ب؟", "خيار أ", "خيار ب", 2, ""],
      [U9.questionC, S, L2, "سؤال الحزمة ج؟", "خيار أ", "خيار ب", 1, ""],
    ]),
    /** Same (already updated) content for question A, new subject-level target. */
    "u09_09_questions_retarget.xlsx": sheet("questions", QUESTION_COLUMNS, [
      [U9.questionA, S, "", "سؤال الحزمة أ — نص معدّل؟", "خيار أ", "خيار ب", 1, "شرح أ"],
    ]),
    /**
     * Broken subject reference. An unknown unit_code only resolves to NULL
     * (units are optional), so the failure must come from the required
     * subject binding: valid row first, then the unresolvable one, which
     * proves the whole template rolls back rather than half-applying.
     */
    "u09_03_lessons_broken.xlsx": sheet(
      "lessons",
      [
        "lesson_code",
        "subject_code",
        "unit_code",
        "title",
        "duration",
        "semester",
        "is_free",
        "sort_order",
      ],
      [
        [U9.lessonA, S, U9.unit, "درس الحزمة الأول", "12 دقيقة", 1, "false", 1],
        [
          U9.lessonBroken,
          "e2e-u9-sub-missing",
          U9.unit,
          "درس بمرجع مادة مفقودة",
          "5 دقائق",
          1,
          "false",
          9,
        ],
      ],
    ),
  };
}

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
